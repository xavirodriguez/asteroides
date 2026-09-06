import { World, SystemPhase, BlueprintRegistry, EventBus } from "@tiny-aster/core";
import { SpawnDirectorSystem } from "../systems/SpawnDirectorSystem";
import { SpawnDirectorComponent, WaveDefinition } from "../components/SpawnComponents";

describe("SpawnDirectorSystem", () => {
  let world: World<any, any>;
  let directorSystem: SpawnDirectorSystem;

  beforeEach(() => {
    world = new World<any, any>();
    const eventBus = new EventBus<any>();
    world.setResource("EventBus", eventBus);

    // Register a simple enemy blueprint
    const blueprints = new BlueprintRegistry<any, any, any>();
    blueprints.register("enemy", {
      spawn: (w: any, entity: number, args: { hp: number }) => {
        w.addComponent(entity, { type: "Transform", x: 0, y: 0 } as any);
        w.addComponent(entity, { type: "Health", current: args.hp, max: args.hp } as any);
      }
    });
    world.setResource("BlueprintRegistry", blueprints);

    directorSystem = new SpawnDirectorSystem();
    world.addSystem(directorSystem, { phase: SystemPhase.Simulation });
  });

  it("should process sequential waves and manage cooldowns", () => {
    // 1. Setup wave definitions as resource
    const waveDefs: WaveDefinition[] = [
      {
        id: "wave_1",
        cooldown: 2.0,
        spawns: [
          { blueprintId: "enemy", args: { hp: 5 }, delay: 0.0 },
          { blueprintId: "enemy", args: { hp: 5 }, delay: 1.0 }
        ]
      },
      {
        id: "wave_2",
        cooldown: 3.0,
        spawns: [
          { blueprintId: "enemy", args: { hp: 10 }, delay: 0.0 }
        ]
      }
    ];
    world.setResource("WaveDefinitions", waveDefs);

    // 2. Create Director entity
    const directorEntity = world.createEntity();
    world.addComponent(directorEntity, {
      type: "SpawnDirector",
      waveIndex: 0,
      cooldownRemaining: 0,
      pendingSpawns: [],
      waveElapsedTime: 0,
      enemiesRemaining: 0,
      status: "idle"
    } as any);

    let waveStarted = false;
    let waveComplete = false;

    world.getEventBus()?.on("spawn:wave_start", (e: any) => {
      expect(e.waveIndex).toBe(0);
      expect(e.waveId).toBe("wave_1");
      waveStarted = true;
    });

    // Run tick 1 -> Transitions to spawning, spawns first enemy at delay 0.0
    world.update(0.016);
    world.getEventBus()?.flushDeferred();

    expect(waveStarted).toBe(true);
    let director = world.getComponent(directorEntity, "SpawnDirector" as any) as any;
    expect(director.status).toBe("spawning");
    expect(director.waveIndex).toBe(0);
    expect(director.pendingSpawns.length).toBe(1); // 1 spawn still pending (delay 1.0)

    // Check 1 WaveMember spawned
    let members = world.query("WaveMember" as any);
    expect(members.length).toBe(1);

    // Advance 0.5 seconds -> spawn time not reached for 2nd enemy
    world.update(0.5);
    members = world.query("WaveMember" as any);
    expect(members.length).toBe(1);

    // Advance another 0.6 seconds -> Total 1.116s. Spawns 2nd enemy!
    world.update(0.6);
    members = world.query("WaveMember" as any);
    expect(members.length).toBe(2);

    // Let one tick run to update the enemiesRemaining counter with flushed WaveMembers
    world.update(0.016);

    director = world.getComponent(directorEntity, "SpawnDirector" as any) as any;
    expect(director.status).toBe("active"); // All spawns complete, now active
    expect(director.enemiesRemaining).toBe(2);

    // Test listener for wave complete
    world.getEventBus()?.on("spawn:wave_complete", (e: any) => {
      expect(e.waveIndex).toBe(0);
      expect(e.waveId).toBe("wave_1");
      waveComplete = true;
    });

    // Simulate killing one enemy -> 1 left, wave not complete
    world.getCommandBuffer().removeEntity(members[0]);
    world.update(0.016);
    world.getEventBus()?.flushDeferred();
    expect(waveComplete).toBe(false);

    // Simulate killing second enemy -> wave complete!
    members = world.query("WaveMember" as any);
    world.getCommandBuffer().removeEntity(members[0]);
    world.update(0.016); // Removes enemy 2 at end of tick

    // Run one more tick to let SpawnDirectorSystem query and detect 0 remaining members
    world.update(0.016);
    world.getEventBus()?.flushDeferred();

    director = world.getComponent(directorEntity, "SpawnDirector" as any) as any;
    expect(waveComplete).toBe(true);
    expect(director.status).toBe("cooldown");
    expect(director.cooldownRemaining).toBeCloseTo(2.0 - 0.016); // Accounts for the small tick elapsed in cooldown

    // Advance through the remaining cooldown -> Transitions back to idle, then starts Wave 2!
    world.update(2.1);
    director = world.getComponent(directorEntity, "SpawnDirector" as any) as any;

    world.update(0.016); // Let the 'idle' status load Wave 2 and transition to spawning / active
    director = world.getComponent(directorEntity, "SpawnDirector" as any) as any;

    expect(director.waveIndex).toBe(1);
    expect(director.status).toBe("active"); // Completed the only spawn request at delay 0.0 immediately
    expect(director.activeWaveId).toBe("wave_2");
  });

  it("should snapshot, restore midway through cooldown or pending spawns, and avoid duplications", () => {
    const waveDefs: WaveDefinition[] = [
      {
        id: "wave_1",
        cooldown: 2.0,
        spawns: [
          { blueprintId: "enemy", args: { hp: 5 }, delay: 1.0 }
        ]
      }
    ];
    world.setResource("WaveDefinitions", waveDefs);

    const directorEntity = world.createEntity();
    world.addComponent(directorEntity, {
      type: "SpawnDirector",
      waveIndex: 0,
      cooldownRemaining: 0,
      pendingSpawns: [],
      waveElapsedTime: 0,
      enemiesRemaining: 0,
      status: "idle"
    } as any);

    // Step 1: Start wave 1
    world.update(0.1);
    let director = world.getComponent(directorEntity, "SpawnDirector" as any) as any;
    expect(director.status).toBe("spawning");
    expect(director.waveElapsedTime).toBeCloseTo(0.1);

    // Capture Snapshot before spawn (at 0.1s)
    const snapshot = world.snapshot();

    // Step 2: Advance to 1.1s -> Enemy spawns
    world.update(1.0);
    let members = world.query("WaveMember" as any);
    expect(members.length).toBe(1);

    // Step 3: Restore to 0.1s -> Enemy should not exist and pendingSpawns restored
    world.restore(snapshot);
    members = world.query("WaveMember" as any);
    expect(members.length).toBe(0);

    director = world.getComponent(directorEntity, "SpawnDirector" as any) as any;
    expect(director.status).toBe("spawning");
    expect(director.waveElapsedTime).toBeCloseTo(0.1);

    // Step 4: Advance again -> Spawns exactly 1 enemy, avoiding duplicate spawn
    world.update(1.0);
    members = world.query("WaveMember" as any);
    expect(members.length).toBe(1);
  });
});
