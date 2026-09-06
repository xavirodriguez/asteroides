import { World, SystemPhase, BlueprintRegistry, EventBus, RandomService } from "@tiny-aster/core";
import { SpawnDirectorSystem } from "@tiny-aster/gameplay-kit";
import { generateGeometryWarsWaves } from "../config/GeometryWarsWaves";
import { registerGeometryWarsBlueprints } from "../entities/GeometryWarsEntities";

describe("Geometry Wars Geometric Waves & Spawning", () => {
  let world: World<any, any>;

  beforeEach(() => {
    world = new World<any, any>();
    const eventBus = new EventBus<any>();
    world.setResource("EventBus", eventBus);

    // Register real game blueprints including the new seeker, evader, and fast_seeker
    registerGeometryWarsBlueprints(world);

    // Add required systems
    world.addSystem(new SpawnDirectorSystem(), { phase: SystemPhase.Simulation });

    // Load waves
    const waves = generateGeometryWarsWaves(800, 600);
    world.setResource("WaveDefinitions", waves);
    world.setResource("GameConfig", { WIDTH: 800, HEIGHT: 600 });
  });

  it("should generate Wave 1 (Line), Wave 2 (Ring), and Wave 3 (Spiral) with exact coordinates", () => {
    const waves = generateGeometryWarsWaves(800, 600);
    expect(waves.length).toBe(3);

    // Wave 1: Line pattern (5 seeker spawns at Y = 80)
    const wave1 = waves[0];
    expect(wave1.id).toBe("wave_1");
    expect(wave1.spawns.length).toBe(5);
    for (let i = 0; i < 5; i++) {
      expect(wave1.spawns[i].blueprintId).toBe("seeker");
      expect(wave1.spawns[i].args.y).toBe(80);
      expect(wave1.spawns[i].args.x).toBe(150 + i * 125);
      expect(wave1.spawns[i].delay).toBe(0);
    }

    // Wave 2: Ring pattern (8 spawns, alternating seeker and evader around center)
    const wave2 = waves[1];
    expect(wave2.id).toBe("wave_2");
    expect(wave2.spawns.length).toBe(8);
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI * 2) / 8;
      const expectedX = 400 + Math.cos(angle) * 200;
      const expectedY = 300 + Math.sin(angle) * 200;
      expect(wave2.spawns[i].args.x).toBeCloseTo(expectedX, 4);
      expect(wave2.spawns[i].args.y).toBeCloseTo(expectedY, 4);
      expect(wave2.spawns[i].blueprintId).toBe(i % 2 === 0 ? "seeker" : "evader");
      expect(wave2.spawns[i].delay).toBe(0);
    }

    // Wave 3: Spiral pattern (10 fast seekers sequential delays)
    const wave3 = waves[2];
    expect(wave3.id).toBe("wave_3");
    expect(wave3.spawns.length).toBe(10);
    for (let i = 0; i < 10; i++) {
      const angle = i * 1.0;
      const radius = 50 + i * 20;
      const expectedX = 400 + Math.cos(angle) * radius;
      const expectedY = 300 + Math.sin(angle) * radius;
      expect(wave3.spawns[i].args.x).toBeCloseTo(expectedX, 4);
      expect(wave3.spawns[i].args.y).toBeCloseTo(expectedY, 4);
      expect(wave3.spawns[i].blueprintId).toBe("fast_seeker");
      expect(wave3.spawns[i].delay).toBeCloseTo(i * 0.2, 4);
    }
  });

  it("should execute Wave 1 progression and trigger single event emissions", () => {
    // Spawn Director Entity
    const directorEntity = world.createEntity();
    world.addComponent(directorEntity, {
      type: "SpawnDirector",
      waveIndex: 0,
      cooldownRemaining: 0,
      pendingSpawns: [],
      waveElapsedTime: 0,
      enemiesRemaining: 0,
      status: "idle",
    } as any);

    let startEvents = 0;
    let completeEvents = 0;

    world.getEventBus()?.on("spawn:wave_start", (e: any) => {
      expect(e.waveIndex).toBe(0);
      expect(e.waveId).toBe("wave_1");
      startEvents++;
    });

    world.getEventBus()?.on("spawn:wave_complete", (e: any) => {
      expect(e.waveIndex).toBe(0);
      expect(e.waveId).toBe("wave_1");
      completeEvents++;
    });

    // Tick 1 -> Transitions to spawning, spawns all 5 seeker enemies (since delay is 0)
    world.update(0.016);
    world.getEventBus()?.flushDeferred();

    expect(startEvents).toBe(1);
    expect(completeEvents).toBe(0);

    let director = world.getComponent(directorEntity, "SpawnDirector") as any;
    expect(director.status).toBe("active");
    expect(director.waveIndex).toBe(0);

    let waveMembers = world.query("WaveMember");
    expect(waveMembers.length).toBe(5);

    // Let's verify each has Faction and Health components
    for (const member of waveMembers) {
      expect(world.hasComponent(member, "Faction")).toBe(true);
      expect(world.getComponent(member, "Faction")?.value).toBe("enemy");
      expect(world.hasComponent(member, "Health")).toBe(true);
      expect(world.getComponent(member, "Health")?.current).toBe(2); // Seeker has 2 HP
    }

    // Kill all wave members
    for (const member of waveMembers) {
      world.getCommandBuffer().removeEntity(member);
    }

    // Advance 2 ticks -> clears entities and detects 0 enemies
    world.update(0.016); // clears entities at end of tick
    world.update(0.016); // detects 0 remaining wave members and transitions to cooldown
    world.getEventBus()?.flushDeferred();

    director = world.getComponent(directorEntity, "SpawnDirector") as any;
    expect(director.status).toBe("cooldown");
    expect(director.cooldownRemaining).toBeCloseTo(5.0 - 0.016);
    expect(completeEvents).toBe(1);
  });

  it("should handle snapshot, restore, and rollback midway through sequential Spiral Spawns without duplicate entities", () => {
    // Spawn Director Entity starting Wave 3 (index 2)
    const directorEntity = world.createEntity();
    world.addComponent(directorEntity, {
      type: "SpawnDirector",
      waveIndex: 2,
      cooldownRemaining: 0,
      pendingSpawns: [],
      waveElapsedTime: 0,
      enemiesRemaining: 0,
      status: "idle",
    } as any);

    // Step 1: Tick to start Wave 3 (transitions to spawning, spawns first enemy at t = 0)
    world.update(0.1);
    let waveMembers = world.query("WaveMember");
    expect(waveMembers.length).toBe(1); // Spawns index 0

    let director = world.getComponent(directorEntity, "SpawnDirector") as any;
    expect(director.status).toBe("spawning");
    expect(director.waveElapsedTime).toBeCloseTo(0.1);

    // Capture Snapshot midway through the pattern
    const snapshot = world.snapshot();

    // Step 2: Advance by 1.1 seconds -> Spiral spawner spawns sequentially up to t = 1.1 (should spawn 7 enemies total, i.e. t=0, 0.2, 0.4, 0.6, 0.8, 1.0, 1.2)
    world.update(1.1);
    waveMembers = world.query("WaveMember");
    expect(waveMembers.length).toBe(7);

    // Step 3: Restore Snapshot back to t = 0.1
    world.restore(snapshot);

    // Verify it returned back to having only 1 spawned enemy and exact elapsed time
    waveMembers = world.query("WaveMember");
    expect(waveMembers.length).toBe(1);

    director = world.getComponent(directorEntity, "SpawnDirector") as any;
    expect(director.status).toBe("spawning");
    expect(director.waveElapsedTime).toBeCloseTo(0.1);

    // Step 4: Advance again -> Spawns remaining sequentially without duplicating the first one
    world.update(1.1);
    waveMembers = world.query("WaveMember");
    expect(waveMembers.length).toBe(7);
  });
});
