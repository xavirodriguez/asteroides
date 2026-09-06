import {
  Scene,
  World,
  MovementSystem,
  HierarchySystem,
  CollisionSystem2D,
  TTLSystem,
  RenderUpdateSystem,
  SystemPhase,
  SteeringSystem,
  EventBus,
  SceneManager,
  Camera2DSystem,
  ScreenShakeSystem,
  JuiceSystem,
  System
} from "@tiny-aster/core";
import { GeometryWarsComponentRegistry, GeometryWarsEventRegistry } from "../types/GeometryWarsRegistry";
import { GeometryWarsConfig } from "../config/GeometryWarsConfig";
import { CombatSystem } from "@tiny-aster/gameplay-kit";
import { SpawnDirectorSystem } from "@tiny-aster/gameplay-kit";
import { generateGeometryWarsWaves } from "../config/GeometryWarsWaves";
import { registerGeometryWarsBlueprints, GeometryWarsEntityFactory } from "../entities/GeometryWarsEntities";
import { GeometryWarsInputSystem } from "../systems/GeometryWarsInputSystem";
import { KineticAccumulatorSystem } from "../systems/KineticAccumulatorSystem";
import { WeaponSystem } from "../systems/WeaponSystem";
import { GWBulletPool, GWParticlePool } from "../EntityPool";
import { GeometryWarsAISystem } from "../systems/GeometryWarsAISystem";
import { WaveDefinition, SpawnRequest } from "@tiny-aster/gameplay-kit";
import { ComboSystem } from "@tiny-aster/core";
import { GeometryWarsGameStateSystem } from "../systems/GeometryWarsGameStateSystem";

/**
 * Main gameplay scene for Geometry Wars.
 * @public
 */
export class GeometryWarsGameScene extends Scene<GeometryWarsComponentRegistry> {
  private config: GeometryWarsConfig;
  private bulletPool: GWBulletPool;
  private particlePool: GWParticlePool;
  private isHeadless: boolean;

  constructor(config: GeometryWarsConfig, isHeadless = false) {
    const world = new World<GeometryWarsComponentRegistry, GeometryWarsEventRegistry>();
    super(world);
    this.config = config;
    this.isHeadless = isHeadless;
    this.bulletPool = new GWBulletPool();
    this.particlePool = new GWParticlePool();
  }

  /**
   * Helper to access the world with correct TS generic typings.
   */
  private get gworld(): World<GeometryWarsComponentRegistry, GeometryWarsEventRegistry, any> {
    return this.world as any;
  }

  public onEnter(): void {
    // 1. Inject resources
    this.gworld.setResource("GameConfig", this.config);
    this.gworld.setResource("ScreenConfig", { width: this.config.WIDTH, height: this.config.HEIGHT });
    this.gworld.setResource("GWBulletPool", this.bulletPool);
    this.gworld.setResource("GWParticlePool", this.particlePool);

    // Ensure EventBus is registered on this scene's world
    if (!this.gworld.getResource("EventBus")) {
      const sceneManager = this.world.getResource<SceneManager>("SceneManager");
      const eventBus = sceneManager ? (sceneManager as any).eventBus : new EventBus();
      this.gworld.setResource("EventBus", eventBus || new EventBus());
    }

    // 2. Register blueprints
    registerGeometryWarsBlueprints(this.gworld);

    // 3. Register systems
    this.gworld.addSystem(new GeometryWarsInputSystem(), { phase: SystemPhase.Simulation });
    this.gworld.addSystem(new GeometryWarsAISystem(), { phase: SystemPhase.Simulation });
    this.gworld.addSystem(new SteeringSystem() as unknown as System<GeometryWarsComponentRegistry>, { phase: SystemPhase.Simulation });
    this.gworld.addSystem(new SpawnDirectorSystem() as unknown as System<GeometryWarsComponentRegistry>, { phase: SystemPhase.Simulation });
    this.gworld.addSystem(new ComboSystem() as unknown as System<GeometryWarsComponentRegistry>, { phase: SystemPhase.Simulation });
    this.gworld.addSystem(new KineticAccumulatorSystem(), { phase: SystemPhase.Simulation });
    this.gworld.addSystem(new WeaponSystem(), { phase: SystemPhase.Simulation });
    this.gworld.addSystem(new MovementSystem(), { phase: SystemPhase.Simulation });
    this.gworld.addSystem(new HierarchySystem(), { phase: SystemPhase.Transform });
    this.gworld.addSystem(new CollisionSystem2D(), { phase: SystemPhase.Collision });
    this.gworld.addSystem(new CombatSystem(), { phase: SystemPhase.Collision });
    this.gworld.addSystem(new GeometryWarsGameStateSystem(), { phase: SystemPhase.GameRules });
    this.gworld.addSystem(new TTLSystem(), { phase: SystemPhase.Simulation });

    if (!this.isHeadless) {
      this.gworld.addSystem(new Camera2DSystem() as any, { phase: SystemPhase.Presentation });
      this.gworld.addSystem(new JuiceSystem() as any, { phase: SystemPhase.Presentation });
      this.gworld.addSystem(new ScreenShakeSystem() as any, { phase: SystemPhase.Presentation });
      this.gworld.addSystem(new RenderUpdateSystem(), { phase: SystemPhase.Presentation });
    }

    // 4. Set procedurally generated wave definitions
    const rand = this.gworld.gameplayRandom;
    rand.unlock();

    const waveDefinitions: WaveDefinition[] = [];

    // Wave 1: Line Spawn (5 Chasers)
    const lineSpawns: SpawnRequest[] = [];
    for (let i = 0; i < 5; i++) {
      const x = 150 + i * 120;
      const y = 80;
      lineSpawns.push({
        blueprintId: "enemy_chaser",
        args: { x, y },
        delay: 0
      });
    }
    waveDefinitions.push({
      id: "wave_1_line",
      spawns: lineSpawns,
      cooldown: 4.0
    });

    // Wave 2: Ring Spawn (6 Evaders)
    const ringSpawns: SpawnRequest[] = [];
    const center_x = this.config.WIDTH / 2;
    const center_y = this.config.HEIGHT / 2;
    const radius = 220;
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI * 2) / 6;
      const x = center_x + Math.cos(angle) * radius;
      const y = center_y + Math.sin(angle) * radius;
      ringSpawns.push({
        blueprintId: "enemy_evader",
        args: { x, y },
        delay: 0
      });
    }
    waveDefinitions.push({
      id: "wave_2_ring",
      spawns: ringSpawns,
      cooldown: 4.0
    });

    // Wave 3: Spiral Spawn (8 Grunts with staggered delays)
    const spiralSpawns: SpawnRequest[] = [];
    for (let i = 0; i < 8; i++) {
      const angle = i * 1.2;
      const dist = 50 + i * 30;
      const x = center_x + Math.cos(angle) * dist;
      const y = center_y + Math.sin(angle) * dist;
      const delay = i * 0.15;
      spiralSpawns.push({
        blueprintId: "enemy_grunt",
        args: { x, y },
        delay
      });
    }
    waveDefinitions.push({
      id: "wave_3_spiral",
      spawns: spiralSpawns,
      cooldown: 5.0
    });

    this.gworld.setResource("WaveDefinitions", waveDefinitions);
    rand.lock();

    // 5. Initialize entities
    GeometryWarsEntityFactory.createGameState(this.gworld);
    GeometryWarsEntityFactory.createSpawnDirector(this.gworld);
    GeometryWarsEntityFactory.createPlayer(this.gworld, this.config.WIDTH / 2, this.config.HEIGHT / 2);

    // Initialize Camera Entity
    const cameraEntity = this.gworld.createEntity();
    this.gworld.addComponent(cameraEntity, {
      type: "Camera2D",
      zoom: 1.0,
      targetX: this.config.WIDTH / 2,
      targetY: this.config.HEIGHT / 2,
      x: this.config.WIDTH / 2,
      y: this.config.HEIGHT / 2,
      isMain: true
    } as any);

    // Initialize ScreenShake singleton entity
    const shakeEntity = this.gworld.createEntity();
    this.gworld.addComponent(shakeEntity, {
      type: "ScreenShake",
      intensity: 0,
      duration: 0,
      remaining: 0
    } as any);

    // Initialize Wave definitions and SpawnDirector
    const waves = generateGeometryWarsWaves(this.config.WIDTH, this.config.HEIGHT);
    this.gworld.setResource("WaveDefinitions", waves);

    const directorEntity = this.gworld.createEntity();
    this.gworld.addComponent(directorEntity, {
      type: "SpawnDirector",
      waveIndex: 0,
      cooldownRemaining: 0,
      pendingSpawns: [],
      waveElapsedTime: 0,
      enemiesRemaining: 0,
      status: "idle"
    } as any);
  }

  public override onExit(): void {
    this.gworld.deleteResource("GWBulletPool");
    this.gworld.deleteResource("GWParticlePool");
  }
}
