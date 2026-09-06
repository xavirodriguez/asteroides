import { World, SystemPhase, CollisionEventsComponent, BlueprintRegistry, EventBus } from "@tiny-aster/core";
import { BENEFICIAL_MUTATORS, NEGATIVE_MUTATORS } from "../../../utils/MutatorRegistry";
import { CombatSystem } from "@tiny-aster/gameplay-kit";
import { SpaceInvadersCollisionSystem } from "../systems/SpaceInvadersCollisionSystem";
import { SpaceInvadersGameStateSystem } from "../systems/SpaceInvadersGameStateSystem";
import { ComboSystem } from "@tiny-aster/core";
import { GameStateComponent, SpaceInvadersComponentRegistry } from "../types/SpaceInvadersTypes";
import { createGameState } from "../EntityFactory";
import { ParticlePool, EnemyBulletPool } from "../EntityPool";
import { SpaceInvadersFormationSystem } from "../systems/SpaceInvadersFormationSystem";

const getGameState = (w: World<any>) => {
  const state = w.getSingleton("GameState") as any;
  if (!state) return undefined;
  let combo = 0;
  let multiplier = 1;
  let comboTimerRemaining = 0;
  const comboEntities = w.query("Combo" as any);
  if (comboEntities.length > 0) {
    const comboComp = w.getComponent(comboEntities[0], "Combo" as any) as any;
    if (comboComp) {
      combo = comboComp.combo;
      multiplier = comboComp.multiplier;
      comboTimerRemaining = Math.max(0, comboComp.timerRemaining);
    }
  }
  return {
    ...state,
    combo,
    multiplier,
    comboTimerRemaining
  };
};

describe("Space Invaders Combo Logic & Performance", () => {
  let world: World<SpaceInvadersComponentRegistry>;
  let collisionSystem: SpaceInvadersCollisionSystem;
  let gameStateSystem: SpaceInvadersGameStateSystem;
  let particlePool: ParticlePool;

  beforeEach(() => {
    world = new World<SpaceInvadersComponentRegistry>();
    const eventBus = new EventBus();
    world.setResource("EventBus", eventBus);

    const blueprints = new BlueprintRegistry<SpaceInvadersComponentRegistry, any, any>();
    blueprints.register("state", {
      spawn: (w: World<SpaceInvadersComponentRegistry>, entity: number, _args: {}) => {
        const config = w.getResource("GameConfig" as any) as any;
        const hasComboHeadStart = w.getResource("HasComboHeadStart") === true;
        const initialCombo = hasComboHeadStart ? 5 : 0;
        const initialMultiplier = hasComboHeadStart ? 2 : 1;
        const initialTimerRemaining = hasComboHeadStart ? config.COMBO_TIMEOUT / 1000 : 0;

        w.addComponent(entity, {
          type: "GameState",
          lives: config.PLAYER_INITIAL_LIVES,
          score: 0,
          level: 1,
          invadersRemaining: 0,
          isGameOver: false,
          screenShake: null,
          kamikazesActive: 0,
        } as any);
        w.addComponent(entity, {
          type: "Combo",
          combo: initialCombo,
          multiplier: initialMultiplier,
          timerRemaining: initialTimerRemaining,
          timerDuration: config.COMBO_TIMEOUT / 1000
        } as any);
      }
    });
    world.setResource("BlueprintRegistry", blueprints);

    const mockConfig = {
      KEYS: {
        LEFT: "ArrowLeft",
        RIGHT: "ArrowRight",
        SHOOT: "Space",
        PAUSE: "KeyP",
        RESTART: "KeyR",
      },
      PLAYER_SPEED: 300,
      PLAYER_INITIAL_LIVES: 3,
      PLAYER_SHOOT_COOLDOWN: 500,
      PLAYER_RENDER_WIDTH: 40,
      PLAYER_COLLIDER_RADIUS: 15,
      PLAYER_BULLET_SPEED: 500,
      PLAYER_BULLET_SIZE: 4,
      PLAYER_BULLET_TTL: 2000,
      ENEMY_BULLET_SPEED: 250,
      ENEMY_BULLET_SIZE: 4,
      ENEMY_BULLET_TTL: 3000,
      ENEMY_FIRE_INTERVAL_MIN: 1000,
      ENEMY_FIRE_INTERVAL_MAX: 3000,
      INVADER_ROWS: 5,
      INVADER_COLS: 11,
      INVADER_SPACING_X: 50,
      INVADER_SPACING_Y: 40,
      INVADER_START_X: 100,
      INVADER_START_Y: 100,
      INVADER_SPEED_BASE: 50,
      INVADER_SPEED_MAX: 400,
      INVADER_DESCENT_STEP: 20,
      SHIELD_COUNT: 4,
      SHIELD_SEGMENTS_X: 4,
      SHIELD_SEGMENTS_Y: 3,
      SHIELD_SEGMENT_HP: 3,
      SHIELD_START_Y: 480,
      SHIELD_WIDTH: 60,
      SHIELD_HEIGHT: 40,
      SHIELD_SPACING: 150,
      SHIELD_START_X: 100,
      SHIELD_SEGMENT_SIZE: 15,
      PARTICLE_COUNT: 8,
      PARTICLE_TTL_BASE: 500,
      COMBO_TIMEOUT: 2000, // 2 seconds
      MAX_MULTIPLIER: 5,
    };
    world.setResource("GameConfig", mockConfig);

    particlePool = new ParticlePool();
    collisionSystem = new SpaceInvadersCollisionSystem(particlePool);

    const mockGame = {
      isMultiplayer: false,
      isPaused: false,
      unifiedInput: {},
    } as any;
    gameStateSystem = new SpaceInvadersGameStateSystem(mockGame);

    world.addSystem(new CombatSystem(), { phase: SystemPhase.Collision });
    world.addSystem(collisionSystem, { phase: SystemPhase.GameRules });
    world.addSystem(gameStateSystem, { phase: SystemPhase.GameRules });
    world.addSystem(new ComboSystem(), { phase: SystemPhase.Simulation });
  });

  it("should initialize GameState with correct default combo values and verify Combo component is attached", () => {
    createGameState(world);
    const gameState = getGameState(world);
    expect(gameState).toBeDefined();
    expect(gameState?.combo).toBe(0);
    expect(gameState?.multiplier).toBe(1);
    expect(gameState?.comboTimerRemaining).toBe(0);

    // Verify GameState component itself does not store combo properties in ECS (single source of truth is Combo)
    const rawGameState = world.getSingleton("GameState") as any;
    expect(rawGameState).toBeDefined();
    expect(rawGameState.combo).toBeUndefined();
    expect(rawGameState.multiplier).toBeUndefined();
    expect(rawGameState.comboTimerRemaining).toBeUndefined();

    // Verify Combo component exists in world and is attached to the GameState entity
    const comboEntities = world.query("Combo" as any);
    expect(comboEntities.length).toBe(1);

    const comboComp = world.getComponent(comboEntities[0], "Combo" as any) as any;
    expect(comboComp).toBeDefined();
    expect(comboComp.combo).toBe(0);
    expect(comboComp.multiplier).toBe(1);
    expect(comboComp.timerRemaining).toBe(0);
  });

  it("should increment combo and reset timer on invader destruction", () => {
    createGameState(world);

    // Add a dummy Boss to prevent wave spawning from level progression
    const dummyBoss = world.createEntity();
    world.addComponent(dummyBoss, { type: "Boss", hp: 10, maxHp: 10, timer: 0, phase: 1 });

    // Create an invader with CollisionEvents
    const invader = world.createEntity();
    world.addComponent(invader, { type: "Invader", row: 0, col: 0, points: 10 });
    world.addComponent(invader, { type: "Transform", x: 100, y: 100, rotation: 0, scaleX: 1, scaleY: 1, worldX: 100, worldY: 100, worldRotation: 0, worldScaleX: 1, worldScaleY: 1, dirty: false });
    world.addComponent(invader, { type: "Render", shape: "invader", size: 20, color: "#FFF", visible: true, opacity: 1, order: 0, hitFlashFrames: 0, angularVelocity: 0, rotation: 0 });
    world.addComponent(invader, { type: "Health", current: 1, max: 1, invulnerableRemaining: 0 });
    world.addComponent(invader, { type: "Faction", faction: "enemy", value: "enemy" });

    // Create player bullet
    const bullet = world.createEntity();
    world.addComponent(bullet, { type: "PlayerBullet" });
    world.addComponent(bullet, { type: "Transform", x: 100, y: 100, rotation: 0, scaleX: 1, scaleY: 1, worldX: 100, worldY: 100, worldRotation: 0, worldScaleX: 1, worldScaleY: 1, dirty: false });
    world.addComponent(bullet, { type: "Damage", amount: 1, category: "player_bullet", friendlyFire: false, consumption: "destroy-entity" });
    world.addComponent(bullet, { type: "Faction", faction: "player", value: "player" });

    // Add CollisionEvents to both invader and bullet to trigger handling
    const events: CollisionEventsComponent = {
      type: "CollisionEvents",
      collisions: [{ otherEntity: bullet, normalX: 0, normalY: 0, depth: 0, contactPoints: [] }],
      activeTriggers: [],
      triggersEntered: [],
      triggersExited: []
    };
    world.addComponent(invader, events);

    const bulletEvents: CollisionEventsComponent = {
      type: "CollisionEvents",
      collisions: [{ otherEntity: invader, normalX: 0, normalY: 0, depth: 0, contactPoints: [] }],
      activeTriggers: [],
      triggersEntered: [],
      triggersExited: []
    };
    world.addComponent(bullet, bulletEvents);

    // Run collision update
    world.update(0.016);
    world.getEventBus()?.flushDeferred();

    const gameState = getGameState(world);
    expect(gameState?.combo).toBe(1);
    // With phase-based update, ComboSystem runs before CollisionSystem, so the timer is set to 2.0 at the end of the tick
    expect(gameState?.comboTimerRemaining).toBe(2.0);
    expect(gameState?.multiplier).toBe(1); // 1 + floor(1/5) = 1
  });

  it("should calculate multiplier progression correctly up to MAX_MULTIPLIER", () => {
    createGameState(world);

    // Add a dummy Boss to prevent wave spawning from level progression
    const dummyBoss = world.createEntity();
    world.addComponent(dummyBoss, { type: "Boss", hp: 10, maxHp: 10, timer: 0, phase: 1 });

    const addKill = (bulletId: number) => {
      const invader = world.createEntity();
      world.addComponent(invader, { type: "Invader", row: 0, col: 0, points: 10 });
      world.addComponent(invader, { type: "Transform", x: 100, y: 100, rotation: 0, scaleX: 1, scaleY: 1, worldX: 100, worldY: 100, worldRotation: 0, worldScaleX: 1, worldScaleY: 1, dirty: false });
      world.addComponent(invader, { type: "Render", shape: "invader", size: 20, color: "#FFF", visible: true, opacity: 1, order: 0, hitFlashFrames: 0, angularVelocity: 0, rotation: 0 });
      world.addComponent(invader, { type: "Health", current: 1, max: 1, invulnerableRemaining: 0 });
      world.addComponent(invader, { type: "Faction", faction: "enemy", value: "enemy" });

      const bullet = world.createEntity();
      world.addComponent(bullet, { type: "PlayerBullet" });
      world.addComponent(bullet, { type: "Transform", x: 100, y: 100, rotation: 0, scaleX: 1, scaleY: 1, worldX: 100, worldY: 100, worldRotation: 0, worldScaleX: 1, worldScaleY: 1, dirty: false });
      world.addComponent(bullet, { type: "Damage", amount: 1, category: "player_bullet", friendlyFire: false, consumption: "destroy-entity" });
      world.addComponent(bullet, { type: "Faction", faction: "player", value: "player" });

      const events: CollisionEventsComponent = {
        type: "CollisionEvents",
        collisions: [{ otherEntity: bullet, normalX: 0, normalY: 0, depth: 0, contactPoints: [] }],
        activeTriggers: [],
        triggersEntered: [],
        triggersExited: []
      };
      world.addComponent(invader, events);

      const bulletEvents: CollisionEventsComponent = {
        type: "CollisionEvents",
        collisions: [{ otherEntity: invader, normalX: 0, normalY: 0, depth: 0, contactPoints: [] }],
        activeTriggers: [],
        triggersEntered: [],
        triggersExited: []
      };
      world.addComponent(bullet, bulletEvents);

      world.update(0.016);
      world.getEventBus()?.flushDeferred();
    };

    // Kill 1
    addKill(100);
    expect(getGameState(world)?.combo).toBe(1);
    expect(getGameState(world)?.multiplier).toBe(1);

    // Kill up to 5 -> multiplier should become 2 (1 + floor(5/5) = 2)
    for (let i = 2; i <= 5; i++) {
      addKill(100 + i);
    }
    expect(getGameState(world)?.combo).toBe(5);
    expect(getGameState(world)?.multiplier).toBe(2);

    // Kill up to 25 -> multiplier capped at MAX_MULTIPLIER = 5 (1 + floor(25/5) = 6 capped to 5)
    for (let i = 6; i <= 25; i++) {
      addKill(100 + i);
    }
    expect(getGameState(world)?.combo).toBe(25);
    expect(getGameState(world)?.multiplier).toBe(5); // Capped at MAX_MULTIPLIER
  });

  it("should expire combo back to 0 and multiplier to 1 when COMBO_TIMEOUT is reached", () => {
    createGameState(world);

    // Mutate Combo component manually to simulate combo
    const comboEntities = world.query("Combo" as any);
    world.mutateComponent(comboEntities[0], "Combo" as any, (c: any) => {
      c.combo = 10;
      c.multiplier = 3;
      c.timerRemaining = 2.0;
    });

    // Advance 1.0 second -> combo timer decrements but combo is preserved
    world.update(1.0);
    let gameState = getGameState(world);
    expect(gameState?.combo).toBe(10);
    expect(gameState?.multiplier).toBe(3);
    expect(gameState?.comboTimerRemaining).toBeCloseTo(1.0);

    // Advance another 1.1 seconds -> combo timer reaches 0 and combo expires
    world.update(1.1);
    gameState = getGameState(world);
    expect(gameState?.combo).toBe(0);
    expect(gameState?.multiplier).toBe(1);
    expect(gameState?.comboTimerRemaining).toBe(0);
  });

  it("should NOT mutate GameState in resting state (stateVersion should only increase by invaders count query/tick)", () => {
    createGameState(world);

    // Add a dummy Boss to prevent wave spawning from level progression
    const dummyBoss = world.createEntity();
    world.addComponent(dummyBoss, { type: "Boss", hp: 10, maxHp: 10, timer: 0, phase: 1 });

    // Wait 1 tick to flush initial setup
    world.update(0.016);

    const versionBefore = world.stateVersion;

    // Run 5 consecutive resting updates
    for (let i = 0; i < 5; i++) {
      world.update(0.016);
    }

    const versionAfter = world.stateVersion;
    // Tick is incremented per update, but stateVersion increments only on component/structural mutations.
    // Since invadersRemaining is in updateGameState, that always mutates GameState once.
    // Screen shake and combo timer decrements are skipped entirely when inactive.
    // So stateVersion increases exactly by 5 (1 per tick).
    expect(versionAfter - versionBefore).toBe(5);
  });

  describe("Beneficial Mutator 'combo_head_start'", () => {
    it("should initialize GameState with combo x2 when 'combo_head_start' is applied", () => {
      BENEFICIAL_MUTATORS["combo_head_start"].apply(world);
      createGameState(world);

      const gameState = getGameState(world);
      expect(gameState).toBeDefined();
      expect(gameState?.combo).toBe(5);
      expect(gameState?.multiplier).toBe(2);
      expect(gameState?.comboTimerRemaining).toBe(2.0); // COMBO_TIMEOUT / 1000 = 2000 / 1000

      const comboEntities = world.query("Combo" as any);
      expect(comboEntities.length).toBe(1);
      const comboComp = world.getComponent(comboEntities[0], "Combo" as any) as any;
      expect(comboComp).toBeDefined();
      expect(comboComp.combo).toBe(5);
      expect(comboComp.multiplier).toBe(2);
      expect(comboComp.timerRemaining).toBe(2.0);
    });

    it("should score first impact with x2 multiplier when 'combo_head_start' is active", () => {
      BENEFICIAL_MUTATORS["combo_head_start"].apply(world);
      createGameState(world);

      // Add a dummy Boss to prevent wave spawning from level progression
      const dummyBoss = world.createEntity();
      world.addComponent(dummyBoss, { type: "Boss", hp: 10, maxHp: 10, timer: 0, phase: 1 });

      // Create an invader with CollisionEvents
      const invader = world.createEntity();
      world.addComponent(invader, { type: "Invader", row: 0, col: 0, points: 10 });
      world.addComponent(invader, { type: "Transform", x: 100, y: 100, rotation: 0, scaleX: 1, scaleY: 1, worldX: 100, worldY: 100, worldRotation: 0, worldScaleX: 1, worldScaleY: 1, dirty: false });
      world.addComponent(invader, { type: "Render", shape: "invader", size: 20, color: "#FFF", visible: true, opacity: 1, order: 0, hitFlashFrames: 0, angularVelocity: 0, rotation: 0 });
      world.addComponent(invader, { type: "Health", current: 1, max: 1, invulnerableRemaining: 0 });
      world.addComponent(invader, { type: "Faction", faction: "enemy", value: "enemy" });

      // Create player bullet
      const bullet = world.createEntity();
      world.addComponent(bullet, { type: "PlayerBullet" });
      world.addComponent(bullet, { type: "Transform", x: 100, y: 100, rotation: 0, scaleX: 1, scaleY: 1, worldX: 100, worldY: 100, worldRotation: 0, worldScaleX: 1, worldScaleY: 1, dirty: false });
      world.addComponent(bullet, { type: "Damage", amount: 1, category: "player_bullet", friendlyFire: false, consumption: "destroy-entity" });
      world.addComponent(bullet, { type: "Faction", faction: "player", value: "player" });

      // Add CollisionEvents to trigger handling
      const events: CollisionEventsComponent = {
        type: "CollisionEvents",
        collisions: [{ otherEntity: bullet, normalX: 0, normalY: 0, depth: 0, contactPoints: [] }],
        activeTriggers: [],
        triggersEntered: [],
        triggersExited: []
      };
      world.addComponent(invader, events);

      const bulletEvents: CollisionEventsComponent = {
        type: "CollisionEvents",
        collisions: [{ otherEntity: invader, normalX: 0, normalY: 0, depth: 0, contactPoints: [] }],
        activeTriggers: [],
        triggersEntered: [],
        triggersExited: []
      };
      world.addComponent(bullet, bulletEvents);

      // Run update
      world.update(0.016);
      world.getEventBus()?.flushDeferred();

      const gameState = getGameState(world);
      // Original points is 10. Multiplier was 2 (initial) but the kill increments combo to 6.
      // Next multiplier: Math.min(5, 1 + floor(6 / 5)) = 2.
      // Score gain = 10 * 2 = 20.
      expect(gameState?.combo).toBe(6);
      expect(gameState?.multiplier).toBe(2);
      expect(gameState?.score).toBe(20);
    });

    it("should score first impact with x1 multiplier (normal behavior) without the mutator", () => {
      // Normal behavior: do not apply mutator
      createGameState(world);

      // Add a dummy Boss to prevent wave spawning from level progression
      const dummyBoss = world.createEntity();
      world.addComponent(dummyBoss, { type: "Boss", hp: 10, maxHp: 10, timer: 0, phase: 1 });

      // Create an invader with CollisionEvents
      const invader = world.createEntity();
      world.addComponent(invader, { type: "Invader", row: 0, col: 0, points: 10 });
      world.addComponent(invader, { type: "Transform", x: 100, y: 100, rotation: 0, scaleX: 1, scaleY: 1, worldX: 100, worldY: 100, worldRotation: 0, worldScaleX: 1, worldScaleY: 1, dirty: false });
      world.addComponent(invader, { type: "Render", shape: "invader", size: 20, color: "#FFF", visible: true, opacity: 1, order: 0, hitFlashFrames: 0, angularVelocity: 0, rotation: 0 });
      world.addComponent(invader, { type: "Health", current: 1, max: 1, invulnerableRemaining: 0 });
      world.addComponent(invader, { type: "Faction", faction: "enemy", value: "enemy" });

      // Create player bullet
      const bullet = world.createEntity();
      world.addComponent(bullet, { type: "PlayerBullet" });
      world.addComponent(bullet, { type: "Transform", x: 100, y: 100, rotation: 0, scaleX: 1, scaleY: 1, worldX: 100, worldY: 100, worldRotation: 0, worldScaleX: 1, worldScaleY: 1, dirty: false });
      world.addComponent(bullet, { type: "Damage", amount: 1, category: "player_bullet", friendlyFire: false, consumption: "destroy-entity" });
      world.addComponent(bullet, { type: "Faction", faction: "player", value: "player" });

      // Add CollisionEvents to trigger handling
      const events: CollisionEventsComponent = {
        type: "CollisionEvents",
        collisions: [{ otherEntity: bullet, normalX: 0, normalY: 0, depth: 0, contactPoints: [] }],
        activeTriggers: [],
        triggersEntered: [],
        triggersExited: []
      };
      world.addComponent(invader, events);

      const bulletEvents: CollisionEventsComponent = {
        type: "CollisionEvents",
        collisions: [{ otherEntity: invader, normalX: 0, normalY: 0, depth: 0, contactPoints: [] }],
        activeTriggers: [],
        triggersEntered: [],
        triggersExited: []
      };
      world.addComponent(bullet, bulletEvents);

      // Run update
      world.update(0.016);
      world.getEventBus()?.flushDeferred();

      const gameState = getGameState(world);
      // Normal: combo = 1, multiplier = 1, score gain = 10 * 1 = 10.
      expect(gameState?.combo).toBe(1);
      expect(gameState?.multiplier).toBe(1);
      expect(gameState?.score).toBe(10);
    });
  });

  describe("SpaceInvadersFormationSystem Deterministic RNG & Firing", () => {
    let enemyBulletPool: EnemyBulletPool;
    let formationSystem: SpaceInvadersFormationSystem;

    beforeEach(() => {
      enemyBulletPool = new EnemyBulletPool();
      formationSystem = new SpaceInvadersFormationSystem(enemyBulletPool);
    });

    it("should update formation position and fire an enemy bullet when cooldown expires using gameplayRandom without throwing", () => {
      // 1. Set up Config resource
      const mockConfig = {
        KEYS: { LEFT: "ArrowLeft", RIGHT: "ArrowRight", SHOOT: "Space" },
        ENEMY_FIRE_INTERVAL_MIN: 100, // short intervals for testing
        ENEMY_FIRE_INTERVAL_MAX: 200,
        INVADER_ROWS: 5,
        INVADER_COLS: 11,
        INVADER_SPEED_BASE: 50,
        INVADER_SPEED_MAX: 400,
        INVADER_DESCENT_STEP: 20,
      };
      world.setResource("GameConfig" as any, mockConfig);
      world.setResource("EnemyBulletPool" as any, enemyBulletPool);

      // 2. Create the Formation entity
      const formationEntity = world.createEntity();
      world.addComponent(formationEntity, {
        type: "Formation",
        direction: 1,
        stepDownPending: false,
        speed: mockConfig.INVADER_SPEED_BASE,
        descentStep: mockConfig.INVADER_DESCENT_STEP,
        leftBound: 0,
        rightBound: 0,
        fireCooldownRemaining: 50, // 50ms cooldown remaining
      } as any);

      // 3. Create at least one Invader with Transform
      const invaderEntity = world.createEntity();
      world.addComponent(invaderEntity, {
        type: "Invader",
        row: 0,
        col: 0,
        points: 10,
      } as any);
      world.addComponent(invaderEntity, {
        type: "Transform",
        x: 100,
        y: 100,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        worldX: 100,
        worldY: 100,
        worldRotation: 0,
        worldScaleX: 1,
        worldScaleY: 1,
        dirty: false,
      } as any);

      // 4. Register system under testing
      world.addSystem(formationSystem, { phase: SystemPhase.Simulation });

      // Unlock gameplayRandom for test execution (since it defaults to locked)
      world.gameplayRandom.unlock();

      // Ensure no bullet exists in the world/pool initially
      const bulletsBefore = world.query("EnemyBullet" as any);
      expect(bulletsBefore.length).toBe(0);

      // Update the world by 16ms -> cooldown goes from 50 to 34, should not fire
      world.update(16);
      const formation = world.getComponent(formationEntity, "Formation" as any) as any;
      expect(formation.fireCooldownRemaining).toBe(34);
      expect(world.query("EnemyBullet" as any).length).toBe(0);

      // Update the world by another 40ms -> cooldown goes below 0, should fire
      world.update(40);

      // Cooldown should be reset to a new random value between 100 and 200 (approx)
      const formationAfter = world.getComponent(formationEntity, "Formation" as any) as any;
      expect(formationAfter.fireCooldownRemaining).toBeGreaterThan(0);

      // A bullet should have been spawned!
      const bulletsAfter = world.query("EnemyBullet" as any);
      expect(bulletsAfter.length).toBe(1);

      // Verify bullet starts near shooter position
      const bulletPos = world.getComponent(bulletsAfter[0], "Transform" as any) as any;
      expect(bulletPos).toBeDefined();
      expect(bulletPos.x).toBeCloseTo(100 + 16.54545, 3);
      expect(bulletPos.y).toBe(115); // shooter y + 15
    });
  });

  describe("Roguelite Dynamic Mutators & Curse Mutators", () => {
    it("should generate deterministic choices when 'level:completed' is emitted, pause simulation, and apply on selection", () => {
      createGameState(world);
      const eventBus = world.getEventBus();

      let pauseCalled = false;
      const mockGame = {
        pause: () => { pauseCalled = true; },
        resume: () => { pauseCalled = false; },
        getWorld: () => world
      } as any;

      // Clear existing systems to isolate testing on our state system and mockGame
      world.schedule.clearSystems();
      const testStateSys = new SpaceInvadersGameStateSystem(mockGame);
      world.addSystem(testStateSys, { phase: SystemPhase.GameRules });

      // Verify no RunMutatorChoices resource is set initially
      expect(world.getResource("RunMutatorChoices")).toBeUndefined();

      // Emit 'level:completed'
      eventBus.emit("level:completed", { level: 1, nextLevel: 2 });

      // Choices should be generated and pause should be called
      const choicesRes = world.getResource<any>("RunMutatorChoices");
      expect(choicesRes).toBeDefined();
      expect(choicesRes.active).toBe(true);
      expect(choicesRes.choices.length).toBe(3);
      expect(pauseCalled).toBe(true);

      // Verify deterministic generation: should be 2 beneficial and 1 negative mutator
      const beneficialChoices = choicesRes.choices.filter((id: string) => BENEFICIAL_MUTATORS[id]);
      const negativeChoices = choicesRes.choices.filter((id: string) => NEGATIVE_MUTATORS[id]);
      expect(beneficialChoices.length).toBe(2);
      expect(negativeChoices.length).toBe(1);

      // Now choose a negative mutator, e.g. slower_bullets
      const chosenMutatorId = "slower_bullets";

      // Mock SpaceInvadersGame.selectRunMutator behavior
      const selectRunMutator = (mutatorId: string) => {
        const runMutators = world.getResource<any>("RunMutatorChoices");
        if (runMutators && runMutators.active) {
          if (BENEFICIAL_MUTATORS[mutatorId]) {
            BENEFICIAL_MUTATORS[mutatorId].apply(world);
          } else if (NEGATIVE_MUTATORS[mutatorId]) {
            NEGATIVE_MUTATORS[mutatorId].apply(world);
          }

          const activeRun = world.getResource<string[]>("ActiveRunMutators") || [];
          activeRun.push(mutatorId);
          world.setResource("ActiveRunMutators", activeRun);

          runMutators.active = false;
          world.setResource("RunMutatorChoices", runMutators);

          mockGame.resume();
        }
      };

      // Set initial player bullet speed in config to verify mutation
      world.setResource("GameConfig", { PLAYER_BULLET_SPEED: 500 });
      world.setResource("ActiveRunMutators", []);

      // Select mutator
      selectRunMutator(chosenMutatorId);

      // Check bullet speed is reduced by 15% (500 * 0.85 = 425)
      const config = world.getResource<any>("GameConfig");
      expect(config.PLAYER_BULLET_SPEED).toBe(425);

      // Active list should contain slower_bullets
      const activeRun = world.getResource<string[]>("ActiveRunMutators");
      expect(activeRun).toContain("slower_bullets");

      // Choices should be deactivated and game resumed
      expect(world.getResource<any>("RunMutatorChoices").active).toBe(false);
      expect(pauseCalled).toBe(false);
    });
  });

  describe("Unified World Single Source of Truth", () => {
    it("verifies BaseGame.snapshot(), BaseGame.hash(), and BaseGame.restore() operate on the same World used by active systems", async () => {
      const { SpaceInvadersGame } = await import("../SpaceInvadersGame");
      const game = new SpaceInvadersGame({ headless: true, seed: 12345 });
      await game.init();

      const gameWorld = game.getWorld();
      expect(gameWorld).toBe(game.world);

      // Step simulation
      game.update(0.016);

      const snap1 = game.snapshot();
      const hash1 = game.hash();
      expect(snap1).toBeDefined();
      expect(typeof hash1).toBe("string");

      // Restore snapshot and verify hash equality
      game.restore(snap1);
      const hash2 = game.hash();
      expect(hash2).toBe(hash1);

      game.destroy();
    });
  });
});
