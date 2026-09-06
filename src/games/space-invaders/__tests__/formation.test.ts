import { World, SystemPhase, EventBus, BlueprintRegistry } from "@tiny-aster/core";
import { DEFAULT_SPACE_INVADERS_CONFIG } from "../types/SpaceInvadersConfigSchema";
import { getFormationSize } from "../utils/SpaceInvadersFormationUtils";
import { SpaceInvadersGameScene } from "../scenes/SpaceInvadersGameScene";
import { SpaceInvadersFormationSystem } from "../systems/SpaceInvadersFormationSystem";
import { SpaceInvadersGameStateSystem } from "../systems/SpaceInvadersGameStateSystem";
import { PlayerBulletPool, EnemyBulletPool, ParticlePool } from "../EntityPool";
import { SpaceInvadersComponentRegistry } from "../types/SpaceInvadersTypes";

describe("Space Invaders Progressive Formation Scaling", () => {
  const config = DEFAULT_SPACE_INVADERS_CONFIG;

  describe("getFormationSize", () => {
    it("returns minimum formation size at level 1", () => {
      const size = getFormationSize(1, config);
      expect(size.rows).toBe(config.INVADER_MIN_ROWS); // 3
      expect(size.cols).toBe(config.INVADER_MIN_COLS); // 8
    });

    it("returns maximum formation size at INVADER_FULL_FORMATION_LEVEL (12)", () => {
      const size = getFormationSize(config.INVADER_FULL_FORMATION_LEVEL, config);
      expect(size.rows).toBe(config.INVADER_ROWS); // 5
      expect(size.cols).toBe(config.INVADER_COLS); // 11
    });

    it("returns maximum formation size for level > 12", () => {
      const size = getFormationSize(15, config);
      expect(size.rows).toBe(config.INVADER_ROWS);
      expect(size.cols).toBe(config.INVADER_COLS);
    });

    it("returns intermediate formation size for level 11 (boundary case level FULL_FORMATION_LEVEL - 1)", () => {
      const size = getFormationSize(config.INVADER_FULL_FORMATION_LEVEL - 1, config); // level 11
      // t = (11 - 1) / (12 - 1) = 10 / 11 = 0.909
      // rows = Math.round(3 + 0.909 * 2) = Math.round(4.818) = 5
      // cols = Math.round(8 + 0.909 * 3) = Math.round(10.727) = 11
      expect(size.rows).toBeGreaterThanOrEqual(config.INVADER_MIN_ROWS);
      expect(size.rows).toBeLessThanOrEqual(config.INVADER_ROWS);
      expect(size.cols).toBeGreaterThanOrEqual(config.INVADER_MIN_COLS);
      expect(size.cols).toBeLessThanOrEqual(config.INVADER_COLS);
    });

    it("returns intermediate formation size for level 6", () => {
      const size = getFormationSize(6, config);
      // t = (6 - 1) / 11 = 5 / 11 = 0.4545
      // rows = Math.round(3 + 0.4545 * 2) = Math.round(3.909) = 4
      // cols = Math.round(8 + 0.4545 * 3) = Math.round(9.363) = 9
      expect(size).toEqual({ rows: 4, cols: 9 });
    });
  });

  describe("Wave Definitions in SpaceInvadersGameScene", () => {
    it("generates waveDefs with correct totalInvaders for non-boss levels and isBossWave for boss levels", () => {
      const mockGame = {
        isMultiplayer: false,
        eventBus: new EventBus(),
        blueprints: new BlueprintRegistry(),
        unifiedInput: {},
        _config: { headless: true }
      } as any;

      const playerBulletPool = new PlayerBulletPool();
      const enemyBulletPool = new EnemyBulletPool();
      const particlePool = new ParticlePool();

      const world = new World<SpaceInvadersComponentRegistry>();
      const scene = new SpaceInvadersGameScene(
        mockGame,
        playerBulletPool,
        enemyBulletPool,
        particlePool,
        config,
        world
      );

      scene.onEnter();

      const waveDefs = world.getResource<any[]>("WaveDefinitions");
      expect(waveDefs).toBeDefined();
      expect(waveDefs?.length).toBe(50);

      // Level 1: 3x8 = 24 invaders
      const level1Wave = waveDefs![0];
      expect(level1Wave.id).toBe("level_1");
      expect(level1Wave.totalInvaders).toBe(24);
      expect(level1Wave.spawns.length).toBe(24);
      expect(level1Wave.isBossWave).toBeUndefined();

      // Level 5: Boss wave
      const level5Wave = waveDefs![4];
      expect(level5Wave.id).toBe("level_5");
      expect(level5Wave.isBossWave).toBe(true);
      expect(level5Wave.totalInvaders).toBe(0);

      // Level 12: Full formation 5x11 = 55 invaders
      const level12Wave = waveDefs![11];
      expect(level12Wave.id).toBe("level_12");
      expect(level12Wave.totalInvaders).toBe(55);
      expect(level12Wave.spawns.length).toBe(55);
    });
  });

  describe("SpaceInvadersFormationSystem speed and ratio calculation", () => {
    let world: World<SpaceInvadersComponentRegistry>;
    let enemyBulletPool: EnemyBulletPool;
    let formationSystem: SpaceInvadersFormationSystem;

    beforeEach(() => {
      world = new World<SpaceInvadersComponentRegistry>();
      world.setResource("GameConfig", config);
      world.setResource("EventBus", new EventBus());
      enemyBulletPool = new EnemyBulletPool();
      formationSystem = new SpaceInvadersFormationSystem(enemyBulletPool);
      world.addSystem(formationSystem, { phase: SystemPhase.Simulation });
    });

    it("calculates ratio and newSpeed using formation.totalInvaders when set", () => {
      // Formation entity with totalInvaders = 24 (level 1 size)
      const formationEntity = world.createEntity();
      world.addComponent(formationEntity, {
        type: "Formation",
        direction: 1,
        stepDownPending: false,
        speed: config.INVADER_SPEED_BASE,
        descentStep: config.INVADER_DESCENT_STEP,
        leftBound: 0,
        rightBound: 0,
        fireCooldownRemaining: 1000,
        totalInvaders: 24,
      } as any);

      // Create 12 invaders (half of totalInvaders 24, so ratio = 1 - 12/24 = 0.5)
      for (let i = 0; i < 12; i++) {
        const invader = world.createEntity();
        world.addComponent(invader, { type: "Invader", row: 0, col: i, points: 10 } as any);
        world.addComponent(invader, { type: "Transform", x: 100 + i * 20, y: 100, rotation: 0, scaleX: 1, scaleY: 1, worldX: 100 + i * 20, worldY: 100, worldRotation: 0, worldScaleX: 1, worldScaleY: 1, dirty: false } as any);
      }

      world.update(0.016);

      const formation = world.getComponent(formationEntity, "Formation") as any;
      // Expected speed at level 1 with ratio 0.5:
      // ratio = 1 - 12/24 = 0.5
      // expected speed = 50 + 0.5 * (400 - 50) = 225
      expect(formation.speed).toBe(225);
    });

    it("falls back to INVADER_ROWS * INVADER_COLS when formation.totalInvaders is 0 or undefined", () => {
      const formationEntity = world.createEntity();
      world.addComponent(formationEntity, {
        type: "Formation",
        direction: 1,
        stepDownPending: false,
        speed: config.INVADER_SPEED_BASE,
        descentStep: config.INVADER_DESCENT_STEP,
        leftBound: 0,
        rightBound: 0,
        fireCooldownRemaining: 1000,
        // totalInvaders not set or 0
        totalInvaders: 0,
      } as any);

      // Create 11 invaders (out of 55 default, ratio = 1 - 11/55 = 0.8)
      for (let i = 0; i < 11; i++) {
        const invader = world.createEntity();
        world.addComponent(invader, { type: "Invader", row: 0, col: i, points: 10 } as any);
        world.addComponent(invader, { type: "Transform", x: 100 + i * 20, y: 100, rotation: 0, scaleX: 1, scaleY: 1, worldX: 100 + i * 20, worldY: 100, worldRotation: 0, worldScaleX: 1, worldScaleY: 1, dirty: false } as any);
      }

      world.update(0.016);

      const formation = world.getComponent(formationEntity, "Formation") as any;
      // Expected speed with default 55 total invaders:
      // ratio = 1 - 11/55 = 0.8
      // expected speed = 50 + 0.8 * (400 - 50) = 330
      expect(formation.speed).toBe(330);
    });
  });

  describe("SpaceInvadersGameStateSystem Level Transition totalInvaders Sync", () => {
    it("updates Formation.totalInvaders to match the new wave on level advancement", () => {
      const world = new World<SpaceInvadersComponentRegistry>();
      world.setResource("GameConfig", config);
      world.setResource("EventBus", new EventBus());

      // Mock WaveDefinitions (level 1 = 24, level 2 = 27)
      world.setResource("WaveDefinitions", [
        { id: "level_1", totalInvaders: 24 },
        { id: "level_2", totalInvaders: 27 },
        { id: "level_3", totalInvaders: 30 },
      ]);

      // GameState singleton
      const stateEntity = world.createEntity();
      world.addComponent(stateEntity, {
        type: "GameState",
        level: 1,
        lives: 3,
        score: 0,
        invadersRemaining: 0,
        isGameOver: false,
      } as any);

      // Formation entity
      const formationEntity = world.createEntity();
      world.addComponent(formationEntity, {
        type: "Formation",
        direction: 1,
        stepDownPending: false,
        speed: 50,
        descentStep: 20,
        leftBound: 0,
        rightBound: 0,
        fireCooldownRemaining: 1000,
        totalInvaders: 24,
      } as any);

      // SpawnDirector entity
      const directorEntity = world.createEntity();
      world.addComponent(directorEntity, {
        type: "SpawnDirector",
        waveIndex: 0, // waveIndex 0 = level 1
        cooldownRemaining: 0,
        pendingSpawns: [],
        waveElapsedTime: 0,
        enemiesRemaining: 0,
        status: "idle"
      } as any);

      const mockGame = { pause: jest.fn(), resume: jest.fn() } as any;
      const gameStateSystem = new SpaceInvadersGameStateSystem(mockGame);
      world.addSystem(gameStateSystem, { phase: SystemPhase.GameRules });

      // First tick: level stays 1 (director.waveIndex = 0)
      world.update(0.016);
      let formationComp = world.getComponent(formationEntity, "Formation") as any;
      expect(formationComp.totalInvaders).toBe(24);

      // Advance director.waveIndex to 1 (level 2)
      world.mutateComponent(directorEntity, "SpawnDirector", (d: any) => {
        d.waveIndex = 1;
      });

      // Tick system: gs.level becomes 2 and totalInvaders is synced to 27
      world.update(0.016);

      formationComp = world.getComponent(formationEntity, "Formation") as any;
      expect(formationComp.totalInvaders).toBe(27);
    });
  });
});
