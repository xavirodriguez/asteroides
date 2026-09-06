import { World, SystemPhase, EventBus, WorldSnapshot } from "@tiny-aster/core";
import { CombatSystem } from "@tiny-aster/gameplay-kit";
import { SpaceInvadersCollisionSystem } from "../../../src/games/space-invaders/systems/SpaceInvadersCollisionSystem";
import { ParticlePool, PlayerBulletPool } from "../../../src/games/space-invaders/EntityPool";
import { RollbackSimulation } from "../src/network/RollbackSimulation";
import { SnapshotBuffer } from "../src/snapshots/SnapshotBuffer";
import { SpaceInvadersComponentRegistry } from "../../../src/games/space-invaders/types/SpaceInvadersTypes";
import { DivergenceDetector } from "../src/replay/DivergenceDetector";
import { Simulation } from "../src/runtime/Simulation";
import { CompactInputFrame } from "../src/input/InputFrame";

class TestSimulationAdapter implements Simulation {
  public world: World<SpaceInvadersComponentRegistry>;

  constructor(world: World<SpaceInvadersComponentRegistry>) {
    this.world = world;
  }

  get tick(): number {
    return this.world.tick;
  }

  get state(): any {
    return this.world.getSingleton("GameState");
  }

  step(input: CompactInputFrame): void {
    this.world.update(0.016);
    const eventBus = this.world.getEventBus();
    if (eventBus) {
      this.world.gameplayRandom.unlock();
      try {
        eventBus.flushDeferred();
      } finally {
        this.world.gameplayRandom.lock();
      }
    }
  }

  snapshot(): WorldSnapshot {
    return this.world.snapshot();
  }

  restore(snapshot: WorldSnapshot): void {
    if (snapshot) {
      this.world.restore(snapshot);
    }
  }

  hash(): string {
    const snap = this.snapshot();
    const dataToHash = {
      tick: snap.tick,
      entities: snap.entities,
      components: snap.isSoA ? snap.soaComponentData : snap.componentData,
      seed: snap.seed,
      rngState: snap.rngState
    };
    const str = JSON.stringify(dataToHash);
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }
}

describe("Combat Death Rollback Determinism & Side Effects (Regression)", () => {
  let world: World<SpaceInvadersComponentRegistry>;
  let particlePool: ParticlePool;
  let playerBulletPool: PlayerBulletPool;

  beforeEach(() => {
    world = new World<SpaceInvadersComponentRegistry>();

    const eventBus = new EventBus<any>();
    world.setResource("EventBus", eventBus);

    const mockConfig = {
      KEYS: { LEFT: "ArrowLeft", RIGHT: "ArrowRight", SHOOT: "Space" },
      PLAYER_INITIAL_LIVES: 3,
      PLAYER_BULLET_SPEED: 500,
      PLAYER_BULLET_SIZE: 4,
      PLAYER_BULLET_TTL: 2000,
      ENEMY_BULLET_SPEED: 250,
      ENEMY_BULLET_SIZE: 4,
      ENEMY_BULLET_TTL: 3000,
      PARTICLE_COUNT: 8,
      COMBO_TIMEOUT: 2000,
      MAX_MULTIPLIER: 5,
    };
    world.setResource("GameConfig", mockConfig);

    particlePool = new ParticlePool();
    playerBulletPool = new PlayerBulletPool();

    world.setResource("ParticlePool", particlePool);
    world.setResource("PlayerBulletPool", playerBulletPool);

    world.addSystem(new CombatSystem(), { phase: SystemPhase.Collision });
    world.addSystem(new SpaceInvadersCollisionSystem(particlePool), { phase: SystemPhase.GameRules });
  });

  // Case 1 — Normal execution
  it("Case 1: enemy dies -> deterministic state correct & external side effect exactly once", () => {
    const eventBus = world.getEventBus()!;
    const sfxList: string[] = [];
    eventBus.on("PlaySFX", (evt) => sfxList.push(evt.name));

    const gs = world.createEntity();
    world.addComponent(gs, { type: "GameState", score: 0, lives: 3, level: 1, invadersRemaining: 1, isGameOver: false, screenShake: null, kamikazesActive: 0 } as any);
    const combo = world.createEntity();
    world.addComponent(combo, { type: "Combo", combo: 0, multiplier: 1, timerRemaining: 0, timerDuration: 2 } as any);

    const invader = world.createEntity();
    world.addComponent(invader, { type: "Invader", points: 50, row: 0, col: 0 } as any);
    world.addComponent(invader, { type: "Transform", x: 100, y: 100 } as any);
    world.addComponent(invader, { type: "Health", current: 10, max: 10 } as any);
    world.addComponent(invader, { type: "Faction", faction: "enemy", value: "enemy" } as any);

    const bullet = playerBulletPool.acquire(world, { x: 100, y: 100, dx: 0, dy: -100, size: 4, color: "green", ttl: 2000 });
    world.mutateComponent(bullet, "Damage" as any, (d: any) => { d.amount = 10; });

    world.addComponent(invader, { type: "CollisionEvents", collisions: [{ otherEntity: bullet, normalX: 0, normalY: 0, depth: 0, contactPoints: [] }], activeTriggers: [], triggersEntered: [], triggersExited: [] } as any);
    world.addComponent(bullet, { type: "CollisionEvents", collisions: [{ otherEntity: invader, normalX: 0, normalY: 0, depth: 0, contactPoints: [] }], activeTriggers: [], triggersEntered: [], triggersExited: [] } as any);

    const simulation = new TestSimulationAdapter(world);
    simulation.step({ t: 0, b: 0 });

    const gsComp = world.getComponent(gs, "GameState" as any) as any;
    expect(gsComp.score).toBe(50);
    expect(sfxList.filter(s => s === "explosion").length).toBe(1);
  });

  // Case 2 & 4 — Rollback & Hash Equality
  it("Case 2 & 4: rollback before death -> deterministic final state unchanged & normal hash == resimulated hash", () => {
    // Setup initial world
    const simNormal = new TestSimulationAdapter(world);
    const gs = world.createEntity();
    world.addComponent(gs, { type: "GameState", score: 0, lives: 3, level: 1, invadersRemaining: 1, isGameOver: false, screenShake: null, kamikazesActive: 0 } as any);
    const combo = world.createEntity();
    world.addComponent(combo, { type: "Combo", combo: 0, multiplier: 1, timerRemaining: 0, timerDuration: 2 } as any);

    const invader = world.createEntity();
    world.addComponent(invader, { type: "Invader", points: 50, row: 0, col: 0 } as any);
    world.addComponent(invader, { type: "Transform", x: 100, y: 100 } as any);
    world.addComponent(invader, { type: "Health", current: 10, max: 10 } as any);
    world.addComponent(invader, { type: "Faction", faction: "enemy", value: "enemy" } as any);

    const bullet = playerBulletPool.acquire(world, { x: 100, y: 100, dx: 0, dy: -100, size: 4, color: "green", ttl: 2000 });
    world.mutateComponent(bullet, "Damage" as any, (d: any) => { d.amount = 10; });

    world.addComponent(invader, { type: "CollisionEvents", collisions: [{ otherEntity: bullet, normalX: 0, normalY: 0, depth: 0, contactPoints: [] }], activeTriggers: [], triggersEntered: [], triggersExited: [] } as any);
    world.addComponent(bullet, { type: "CollisionEvents", collisions: [{ otherEntity: invader, normalX: 0, normalY: 0, depth: 0, contactPoints: [] }], activeTriggers: [], triggersEntered: [], triggersExited: [] } as any);

    const rollbackBuffer = new SnapshotBuffer(10);

    // Save snapshot of tick 0 BEFORE step 0
    rollbackBuffer.saveSnapshot(0, simNormal.snapshot());

    simNormal.step({ t: 0, b: 0 }); // Tick 0: Death occurs (advances world.tick to 1)

    // Save snapshot of tick 1 BEFORE step 1
    rollbackBuffer.saveSnapshot(1, simNormal.snapshot());

    simNormal.step({ t: 1, b: 0 }); // Tick 1 (advances world.tick to 2)

    const hashNormal = simNormal.hash();

    // Rollback to tick 0 (restores snapshot at start of tick 0, step 0, then step 1)
    const rollback = new RollbackSimulation(simNormal, rollbackBuffer);
    const inputs = new Map<number, CompactInputFrame>();
    inputs.set(0, { t: 0, b: 0 });
    inputs.set(1, { t: 1, b: 0 });

    rollback.processRollback(0, { t: 0, b: 0 }, 1, inputs);

    const hashResimulated = simNormal.hash();
    expect(hashResimulated).toBe(hashNormal);
  });

  // Case 3 — Side Effects Non-Duplication
  it("Case 3: resimulation -> external death side effect is not duplicated", () => {
    const eventBus = world.getEventBus()!;
    const resimSfx: string[] = [];
    eventBus.on("PlaySFX", (evt) => {
      if (world.isReSimulating) {
        resimSfx.push(evt.name);
      }
    });

    const gs = world.createEntity();
    world.addComponent(gs, { type: "GameState", score: 0, lives: 3, level: 1, invadersRemaining: 1, isGameOver: false, screenShake: null, kamikazesActive: 0 } as any);
    const combo = world.createEntity();
    world.addComponent(combo, { type: "Combo", combo: 0, multiplier: 1, timerRemaining: 0, timerDuration: 2 } as any);

    const invader = world.createEntity();
    world.addComponent(invader, { type: "Invader", points: 50, row: 0, col: 0 } as any);
    world.addComponent(invader, { type: "Transform", x: 100, y: 100 } as any);
    world.addComponent(invader, { type: "Health", current: 10, max: 10 } as any);
    world.addComponent(invader, { type: "Faction", faction: "enemy", value: "enemy" } as any);

    const bullet = playerBulletPool.acquire(world, { x: 100, y: 100, dx: 0, dy: -100, size: 4, color: "green", ttl: 2000 });
    world.mutateComponent(bullet, "Damage" as any, (d: any) => { d.amount = 10; });

    const sim = new TestSimulationAdapter(world);
    const rollbackBuffer = new SnapshotBuffer(10);
    rollbackBuffer.saveSnapshot(0, sim.snapshot());

    world.addComponent(invader, { type: "CollisionEvents", collisions: [{ otherEntity: bullet, normalX: 0, normalY: 0, depth: 0, contactPoints: [] }], activeTriggers: [], triggersEntered: [], triggersExited: [] } as any);
    world.addComponent(bullet, { type: "CollisionEvents", collisions: [{ otherEntity: invader, normalX: 0, normalY: 0, depth: 0, contactPoints: [] }], activeTriggers: [], triggersEntered: [], triggersExited: [] } as any);

    sim.step({ t: 0, b: 0 });
    rollbackBuffer.saveSnapshot(1, sim.snapshot());
    sim.step({ t: 1, b: 0 });

    const rollback = new RollbackSimulation(sim, rollbackBuffer);
    const inputs = new Map<number, CompactInputFrame>();
    inputs.set(0, { t: 0, b: 0 });
    inputs.set(1, { t: 1, b: 0 });

    rollback.processRollback(0, { t: 0, b: 0 }, 1, inputs);

    expect(resimSfx).toEqual([]);
  });

  // Case 5 — DivergenceDetector
  it("Case 5: DivergenceDetector indicates no divergence after rollback resimulation", () => {
    const gs = world.createEntity();
    world.addComponent(gs, { type: "GameState", score: 0, lives: 3, level: 1, invadersRemaining: 1, isGameOver: false, screenShake: null, kamikazesActive: 0 } as any);
    const combo = world.createEntity();
    world.addComponent(combo, { type: "Combo", combo: 0, multiplier: 1, timerRemaining: 0, timerDuration: 2 } as any);

    const invader = world.createEntity();
    world.addComponent(invader, { type: "Invader", points: 50, row: 0, col: 0 } as any);
    world.addComponent(invader, { type: "Transform", x: 100, y: 100 } as any);
    world.addComponent(invader, { type: "Health", current: 10, max: 10 } as any);
    world.addComponent(invader, { type: "Faction", faction: "enemy", value: "enemy" } as any);

    const bullet = playerBulletPool.acquire(world, { x: 100, y: 100, dx: 0, dy: -100, size: 4, color: "green", ttl: 2000 });
    world.mutateComponent(bullet, "Damage" as any, (d: any) => { d.amount = 10; });

    world.addComponent(invader, { type: "CollisionEvents", collisions: [{ otherEntity: bullet, normalX: 0, normalY: 0, depth: 0, contactPoints: [] }], activeTriggers: [], triggersEntered: [], triggersExited: [] } as any);
    world.addComponent(bullet, { type: "CollisionEvents", collisions: [{ otherEntity: invader, normalX: 0, normalY: 0, depth: 0, contactPoints: [] }], activeTriggers: [], triggersEntered: [], triggersExited: [] } as any);

    const sim = new TestSimulationAdapter(world);
    const initialSnap = sim.snapshot();
    const replayInputs = [{ t: 0, b: 0 }, { t: 1, b: 0 }];

    // Record expected hashes from direct step
    const expectedHashes: string[] = [];
    sim.step(replayInputs[0]);
    expectedHashes.push(sim.hash());
    sim.step(replayInputs[1]);
    expectedHashes.push(sim.hash());

    // Check with DivergenceDetector on fresh sim with same inputs
    const freshWorld = new World<SpaceInvadersComponentRegistry>();
    freshWorld.setResource("EventBus", new EventBus<any>());
    freshWorld.setResource("GameConfig", world.getResource("GameConfig"));
    freshWorld.setResource("ParticlePool", particlePool);
    freshWorld.setResource("PlayerBulletPool", playerBulletPool);
    freshWorld.addSystem(new CombatSystem(), { phase: SystemPhase.Collision });
    freshWorld.addSystem(new SpaceInvadersCollisionSystem(particlePool), { phase: SystemPhase.GameRules });

    const fGs = freshWorld.createEntity();
    freshWorld.addComponent(fGs, { type: "GameState", score: 0, lives: 3, level: 1, invadersRemaining: 1, isGameOver: false, screenShake: null, kamikazesActive: 0 } as any);
    const fCombo = freshWorld.createEntity();
    freshWorld.addComponent(fCombo, { type: "Combo", combo: 0, multiplier: 1, timerRemaining: 0, timerDuration: 2 } as any);

    const fInvader = freshWorld.createEntity();
    freshWorld.addComponent(fInvader, { type: "Invader", points: 50, row: 0, col: 0 } as any);
    freshWorld.addComponent(fInvader, { type: "Transform", x: 100, y: 100 } as any);
    freshWorld.addComponent(fInvader, { type: "Health", current: 10, max: 10 } as any);
    freshWorld.addComponent(fInvader, { type: "Faction", faction: "enemy", value: "enemy" } as any);

    const fBullet = playerBulletPool.acquire(freshWorld, { x: 100, y: 100, dx: 0, dy: -100, size: 4, color: "green", ttl: 2000 });
    freshWorld.mutateComponent(fBullet, "Damage" as any, (d: any) => { d.amount = 10; });

    freshWorld.addComponent(fInvader, { type: "CollisionEvents", collisions: [{ otherEntity: fBullet, normalX: 0, normalY: 0, depth: 0, contactPoints: [] }], activeTriggers: [], triggersEntered: [], triggersExited: [] } as any);
    freshWorld.addComponent(fBullet, { type: "CollisionEvents", collisions: [{ otherEntity: fInvader, normalX: 0, normalY: 0, depth: 0, contactPoints: [] }], activeTriggers: [], triggersEntered: [], triggersExited: [] } as any);

    const freshSim = new TestSimulationAdapter(freshWorld);

    const divergenceTick = DivergenceDetector.findDivergenceTick(freshSim, { seed: 42, initialSnapshot: initialSnap, inputs: replayInputs } as any, expectedHashes);

    expect(divergenceTick).toBe(-1);
  });

  // Case 6 — Multiple deaths protection
  it("Case 6: resimulation protection does not suppress legitimate deaths of different entities", () => {
    const eventBus = world.getEventBus()!;
    const explosionCount = () => sfxList.filter(s => s === "explosion").length;
    const sfxList: string[] = [];
    eventBus.on("PlaySFX", (evt) => sfxList.push(evt.name));

    const gs = world.createEntity();
    world.addComponent(gs, { type: "GameState", score: 0, lives: 3, level: 1, invadersRemaining: 2, isGameOver: false, screenShake: null, kamikazesActive: 0 } as any);
    const combo = world.createEntity();
    world.addComponent(combo, { type: "Combo", combo: 0, multiplier: 1, timerRemaining: 0, timerDuration: 2 } as any);

    // Invader 1
    const inv1 = world.createEntity();
    world.addComponent(inv1, { type: "Invader", points: 50, row: 0, col: 0 } as any);
    world.addComponent(inv1, { type: "Transform", x: 100, y: 100 } as any);
    world.addComponent(inv1, { type: "Health", current: 10, max: 10 } as any);
    world.addComponent(inv1, { type: "Faction", faction: "enemy", value: "enemy" } as any);

    // Invader 2
    const inv2 = world.createEntity();
    world.addComponent(inv2, { type: "Invader", points: 50, row: 0, col: 1 } as any);
    world.addComponent(inv2, { type: "Transform", x: 150, y: 100 } as any);
    world.addComponent(inv2, { type: "Health", current: 10, max: 10 } as any);
    world.addComponent(inv2, { type: "Faction", faction: "enemy", value: "enemy" } as any);

    const bullet1 = playerBulletPool.acquire(world, { x: 100, y: 100, dx: 0, dy: -100, size: 4, color: "green", ttl: 2000 });
    world.mutateComponent(bullet1, "Damage" as any, (d: any) => { d.amount = 10; });

    const bullet2 = playerBulletPool.acquire(world, { x: 150, y: 100, dx: 0, dy: -100, size: 4, color: "green", ttl: 2000 });
    world.mutateComponent(bullet2, "Damage" as any, (d: any) => { d.amount = 10; });

    world.addComponent(inv1, { type: "CollisionEvents", collisions: [{ otherEntity: bullet1, normalX: 0, normalY: 0, depth: 0, contactPoints: [] }], activeTriggers: [], triggersEntered: [], triggersExited: [] } as any);
    world.addComponent(bullet1, { type: "CollisionEvents", collisions: [{ otherEntity: inv1, normalX: 0, normalY: 0, depth: 0, contactPoints: [] }], activeTriggers: [], triggersEntered: [], triggersExited: [] } as any);
    world.addComponent(inv2, { type: "CollisionEvents", collisions: [{ otherEntity: bullet2, normalX: 0, normalY: 0, depth: 0, contactPoints: [] }], activeTriggers: [], triggersEntered: [], triggersExited: [] } as any);
    world.addComponent(bullet2, { type: "CollisionEvents", collisions: [{ otherEntity: inv2, normalX: 0, normalY: 0, depth: 0, contactPoints: [] }], activeTriggers: [], triggersEntered: [], triggersExited: [] } as any);

    const sim = new TestSimulationAdapter(world);
    sim.step({ t: 0, b: 0 });

    expect(explosionCount()).toBe(2);
  });

  // Case 7 — Subsequent real death after rollback
  it("Case 7: after rollback, a new legitimate death generates external side effects once", () => {
    const eventBus = world.getEventBus()!;
    const sfxList: string[] = [];
    eventBus.on("PlaySFX", (evt) => sfxList.push(evt.name));

    const gs = world.createEntity();
    world.addComponent(gs, { type: "GameState", score: 0, lives: 3, level: 1, invadersRemaining: 2, isGameOver: false, screenShake: null, kamikazesActive: 0 } as any);
    const combo = world.createEntity();
    world.addComponent(combo, { type: "Combo", combo: 0, multiplier: 1, timerRemaining: 0, timerDuration: 2 } as any);

    // Invader 1 dies at tick 0
    const inv1 = world.createEntity();
    world.addComponent(inv1, { type: "Invader", points: 50, row: 0, col: 0 } as any);
    world.addComponent(inv1, { type: "Transform", x: 100, y: 100 } as any);
    world.addComponent(inv1, { type: "Health", current: 10, max: 10 } as any);
    world.addComponent(inv1, { type: "Faction", faction: "enemy", value: "enemy" } as any);

    const bullet1 = playerBulletPool.acquire(world, { x: 100, y: 100, dx: 0, dy: -100, size: 4, color: "green", ttl: 2000 });
    world.mutateComponent(bullet1, "Damage" as any, (d: any) => { d.amount = 10; });

    const sim = new TestSimulationAdapter(world);
    const rollbackBuffer = new SnapshotBuffer(10);
    rollbackBuffer.saveSnapshot(0, sim.snapshot());

    world.addComponent(inv1, { type: "CollisionEvents", collisions: [{ otherEntity: bullet1, normalX: 0, normalY: 0, depth: 0, contactPoints: [] }], activeTriggers: [], triggersEntered: [], triggersExited: [] } as any);
    world.addComponent(bullet1, { type: "CollisionEvents", collisions: [{ otherEntity: inv1, normalX: 0, normalY: 0, depth: 0, contactPoints: [] }], activeTriggers: [], triggersEntered: [], triggersExited: [] } as any);

    sim.step({ t: 0, b: 0 }); // Tick 0: Invader 1 dies
    expect(sfxList.filter(s => s === "explosion").length).toBe(1);

    rollbackBuffer.saveSnapshot(1, sim.snapshot());
    sim.step({ t: 1, b: 0 }); // Tick 1

    // Rollback resimulate tick 0..1
    const rollback = new RollbackSimulation(sim, rollbackBuffer);
    const inputs = new Map<number, CompactInputFrame>();
    inputs.set(0, { t: 0, b: 0 });
    inputs.set(1, { t: 1, b: 0 });
    rollback.processRollback(0, { t: 0, b: 0 }, 1, inputs);

    // After rollback resimulation, explosion count remains 1
    expect(sfxList.filter(s => s === "explosion").length).toBe(1);

    // Now at tick 2 (normal execution), Invader 2 dies!
    const inv2 = world.createEntity();
    world.addComponent(inv2, { type: "Invader", points: 50, row: 0, col: 1 } as any);
    world.addComponent(inv2, { type: "Transform", x: 150, y: 100 } as any);
    world.addComponent(inv2, { type: "Health", current: 10, max: 10 } as any);
    world.addComponent(inv2, { type: "Faction", faction: "enemy", value: "enemy" } as any);

    const bullet2 = playerBulletPool.acquire(world, { x: 150, y: 100, dx: 0, dy: -100, size: 4, color: "green", ttl: 2000 });
    world.mutateComponent(bullet2, "Damage" as any, (d: any) => { d.amount = 10; });

    world.addComponent(inv2, { type: "CollisionEvents", collisions: [{ otherEntity: bullet2, normalX: 0, normalY: 0, depth: 0, contactPoints: [] }], activeTriggers: [], triggersEntered: [], triggersExited: [] } as any);
    world.addComponent(bullet2, { type: "CollisionEvents", collisions: [{ otherEntity: inv2, normalX: 0, normalY: 0, depth: 0, contactPoints: [] }], activeTriggers: [], triggersEntered: [], triggersExited: [] } as any);

    sim.step({ t: 2, b: 0 });

    // Invader 2 death in normal execution correctly emits second explosion SFX!
    expect(sfxList.filter(s => s === "explosion").length).toBe(2);
  });
});
