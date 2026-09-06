import {
  BaseGame,
  GameDefinition,
  World,
  SystemPhase,
  BlueprintDefinition,
  Component,
  CoreComponentRegistry,
  ConfigService,
  WebAudioPlayer,
  PhysicsIntegrateSystem,
  PlatformerMovementSystem,
  PlatformerGravitySystem,
  TileCollisionSystem,
  PlatformerCoyoteSystem,
  TTLSystem,
  Renderer,
  TilemapRenderSystem,
  Camera2DSystem,
  EnemySensorSystem,
  StateMachineSystem,
  registerEnemyStateMachines,
  HitDetectionSystem,
  CollectibleSystem,
  CheckpointSystem,
  DeathSystem,
  RespawnSystem,
  AnimationSystem,
  RunState,
  SegmentTemplate,
  SegmentGenerator,
  LevelPlan,
  TransformComponent,
  VelocityComponent,
  Collider2DComponent,
  TagComponent,
  HealthComponent,
  Theme,
  resolveThemeColor,
  EntityBuilder
} from "@tiny-aster/core";
import { PlatformerInputSystem } from "./systems/PlatformerInputSystem";
import { resolveAndApplyMutators } from "../../config/MutatorConfig";
import { PlatformerGoalSystem } from "./systems/PlatformerGoalSystem";
import { PlatformerDamageSystem } from "./systems/PlatformerDamageSystem";
import { PlatformerDashSystem } from "./systems/PlatformerDashSystem";
import { PlatformerWallJumpSystem } from "./systems/PlatformerWallJumpSystem";
import { PowerUpSystem, PowerUpRegistry, ArcadeEntityBuilder, registerPlatformerEnemyBlueprints, mutatePlatformerInputState } from "@tiny-aster/gameplay-kit";
import { drawPlatformerPlayer, drawPlatformerGoal } from "./rendering/PlatformerCanvasVisuals";
import { drawMemoryFragment, drawCheckpointNode, drawSentinel, drawHopper, drawCharger } from "../echorunner/rendering/EchoRunnerCanvasVisuals";
import { createThemeFromGameAccents } from "../../theme/gameAccents";
import defaultLevelData from "./levels/level-01.json";
import { PlatformerConfigSchema, PlatformerConfig as PlatformerConfigType, DEFAULT_PLATFORMER_CONFIG } from "./types/PlatformerConfigSchema";

export interface PlatformerConfig {
  seed?: number;
  gameOptions?: Record<string, unknown>;
  theme?: Theme;
  levelData?: { templates: SegmentTemplate[]; grammar: string[] };
}

export interface PlatformerInput {
  moveLeft: boolean;
  moveRight: boolean;
  jump: boolean;
  dash?: boolean;
  [key: string]: unknown;
}

export interface PlatformerGameState extends Component {
  type: "PlatformerGameState";
  score: number;
  lives: number;
  attempts: number;
  isGameOver: boolean;
}

export interface PlatformerBlueprintMap extends Record<string, BlueprintDefinition<CoreComponentRegistry, any, any>> {
  player: BlueprintDefinition<CoreComponentRegistry, any, { x: number; y: number }>;
  tilemap: BlueprintDefinition<CoreComponentRegistry, any, { data: number[][]; tileDefinitions: any }>;
}

export const PLATFORMER_CONFIG = DEFAULT_PLATFORMER_CONFIG;

export class PlatformerGame extends BaseGame<PlatformerGameState, PlatformerInput, CoreComponentRegistry, any, PlatformerBlueprintMap> {
  public readonly gameId = "platformer";
  private gameOver = false;
  private levelPlan!: LevelPlan;
  private customLevelData?: { templates: SegmentTemplate[]; grammar: string[] };
  private baseConfig: PlatformerConfigType;
  private config: PlatformerConfigType;

  constructor(config: PlatformerConfig = {}) {
    super({
      pauseKey: "KeyP",
      restartKey: "KeyR",
      gameOptions: config.gameOptions,
      seed: config.seed,
      theme: config.theme ?? createThemeFromGameAccents("platformer"),
      audio: new WebAudioPlayer()
    });
    this.baseConfig = ConfigService.load<PlatformerConfigType>(
      this.gameId,
      PlatformerConfigSchema,
      config.gameOptions?.rawConfig ?? {}
    );
    this.config = this.baseConfig;
    // TODO(refactor): código duplicado detectado (bloque) con echorunner/EchoRunnerGame.ts:200-207. Considerar extraer a función compartida. Ref: d29aace1
    this.customLevelData = config.levelData ?? (config.gameOptions?.levelData as { templates: SegmentTemplate[]; grammar: string[] } | undefined);
  }

  // TODO(refactor): código duplicado detectado (método) con echorunner/EchoRunnerGame.ts:309-321. Considerar extraer a función compartida. Ref: b8cff4cf
  protected override async onRegisterSystems(): Promise<void> {
    this.config = resolveAndApplyMutators(this.baseConfig, this._config.gameOptions);

    this.world.setResource("GameConfig", this.config);
    // TODO(refactor): código duplicado detectado (bloque) con echorunner/EchoRunnerGame.ts:207-221. Considerar extraer a función compartida. Ref: 44f1ee7d
    this.setupCommonArcadeResources();
    this.world.setResource("DeathPlaneY", 650);

    const runState: RunState = {
      attempt: 1,
      lives: 3,
      activeCheckpoint: null,
      elapsedTime: 0,
      deaths: 0,
      collectedPermanentIds: [],
      collectedTemporalIds: []
    };
    this.world.setResource("RunState", runState);
    this.world.setResource("AudioPlayer", this.audio);

    // Register PowerUp effects
    const powerUpRegistry = new PowerUpRegistry({
      double_jump: {
        apply(world: World<any>, player: number) {
          if (world.hasComponent(player, "PlatformerJumper")) {
            world.mutateComponent(player, "PlatformerJumper", (j: any) => {
              j.maxJumps = 2;
              j.jumpsRemaining = 2;
            });
          }
        }
      },
      dash_unlock: {
        apply(world: World<any>, player: number) {
          world.commands.addComponent(player, {
            type: "DashUnlocked",
            unlocked: true,
            dashSpeed: 500,
            cooldown: 0,
            cooldownMax: 0.8,
            dashTimeRemaining: 0
          });
        }
      },
      wall_jump_unlock: {
        apply(world: World<any>, player: number) {
          world.commands.addComponent(player, {
            type: "WallJumpUnlocked",
            unlocked: true
          });
        }
      }
    });
    this.world.setResource("PowerUpEffects", powerUpRegistry);

    // Event bus listeners
    const eventBus = this.getEventBus();
    if (eventBus) {
      eventBus.on("level:completed", () => {
        this.gameOver = true;
      });
      eventBus.on("PlaySFX", (event: any) => {
        if (event && event.name) {
          this.audio.playSFX(event.name);
        }
      });
      eventBus.on("CollectiblePickedUp", () => {
        this.audio.playSFX("score");
      });
      eventBus.on("PlayerDied", () => {
        this.audio.playSFX("game_over");
      });
    }

    // Register state machines
    registerEnemyStateMachines(this.world);

    // Blueprints
    this.blueprints.register("collectible_fragment", {
      spawn: (world, entity, args: { x: number; y: number; id: string }) => {
        // TODO(refactor): código duplicado detectado (bloque) con echorunner/EchoRunnerGame.ts:324-339. Considerar extraer a función compartida. Ref: fbd854ae
        ArcadeEntityBuilder.fromEntity(world, entity)
          .withTransform({ x: args.x, y: args.y })
          .withRender({
            shape: "fragment",
            size: 16,
            order: 1
          });

        world.addComponent(entity, {
          type: "Collectible",
          kind: "fragment",
          value: 10,
          persistent: false,
          collectOnce: false,
          id: args.id
        } as { type: string; [key: string]: unknown });
      }
    });

    // TODO(refactor): código duplicado detectado (bloque) con platformer/PlatformerGame.ts:187-199. Considerar extraer a función compartida. Ref: 10f25666
    this.blueprints.register("collectible_coin", {
      spawn: (world, entity, args: { x: number; y: number; id: string }) => {
        ArcadeEntityBuilder.fromEntity(world, entity)
          .withTransform({ x: args.x, y: args.y })
          .withRender({
            shape: "fragment",
            size: 16,
            order: 1
          });

        world.addComponent(entity, {
          type: "Collectible",
          kind: "coin",
          value: 20,
          persistent: false,
          collectOnce: false,
          id: args.id
        } as { type: string; [key: string]: unknown });
      }
    });

    this.blueprints.register("checkpoint_node", {
      spawn: (world, entity, args: { x: number; y: number; id: string }) => {
        EntityBuilder.fromEntity(world, entity)
          .withTransform({ x: args.x, y: args.y })
          .withRender({ shape: "node", size: 32, order: 1 });

        world.addComponent(entity, {
          type: "RespawnPoint",
          x: args.x,
          y: args.y - 10,
          checkpointId: args.id
        } as { type: string; [key: string]: unknown });
      }
    });

    registerPlatformerEnemyBlueprints(this.blueprints);

    // TODO(refactor): código duplicado detectado (bloque) con platformer/PlatformerGame.ts:264-273. Considerar extraer a función compartida. Ref: 6d4548db
    this.blueprints.register("powerup_double_jump", {
      spawn: (world, entity, args: { x: number; y: number }) => {
        ArcadeEntityBuilder.fromEntity(world, entity)
          .withTransform({ x: args.x, y: args.y })
          .withCollider2D({
            shape: { type: "aabb", halfWidth: 12, halfHeight: 12 },
            isTrigger: true
          })
          .withCollisionEvents()
          .withPowerUp("double_jump")
          .withRender({
            shape: "fragment",
            size: 18,
            order: 1
          });
      }
    });

    // TODO(refactor): código duplicado detectado (bloque) con platformer/PlatformerGame.ts:252-261. Considerar extraer a función compartida. Ref: 5171adb5
    this.blueprints.register("powerup_dash", {
      spawn: (world, entity, args: { x: number; y: number }) => {
        ArcadeEntityBuilder.fromEntity(world, entity)
          .withTransform({ x: args.x, y: args.y })
          .withCollider2D({
            shape: { type: "aabb", halfWidth: 12, halfHeight: 12 },
            isTrigger: true
          })
          .withCollisionEvents()
          .withPowerUp("dash_unlock")
          .withRender({
            shape: "fragment",
            size: 18,
            order: 1
          });
      }
    });

    this.blueprints.register("goal", {
      spawn: (world, entity, args: { x: number; y: number }) => {
        EntityBuilder.fromEntity(world, entity)
          .withTransform({ x: args.x, y: args.y })
          .withRender({ shape: "goal", size: 32, order: 1 });

        // TODO(refactor): código duplicado detectado (bloque) con echorunner/EchoRunnerGame.ts:249-254. Considerar extraer a función compartida. Ref: 30c73994
        world.addComponent(entity, { type: "LevelGoal", reached: false } as { type: string; [key: string]: unknown });
      }
    });

    this.blueprints.register("player", {
      spawn: (world, entity, args: { x: number; y: number }) => {
        const theme = world.getResource<Theme>("Theme");
        const assetKey = theme?.spriteMap["player"] ?? "player_sprite";
        const tint = resolveThemeColor(world, "player");

        EntityBuilder.fromEntity(world, entity)
          .withTransform({ x: args.x, y: args.y })
          .withVelocity()
          .withCollider({ shape: { type: "aabb", halfWidth: 10, halfHeight: 15 } as any })
          .withRender({ shape: "player", size: 24, color: tint, order: 2 });

        world.addComponent(entity, { type: "Health", current: 3, max: 3 } as HealthComponent);
        world.addComponent(entity, { type: "Tag", tags: ["TileCollider", "Player"] } as any);
        world.addComponent(entity, { type: "Tag", tags: ["TileCollider", "Player"] } as { type: string; [key: string]: unknown });
        world.addComponent(entity, { type: "Sprite", assetKey, anchor: { x: 0.5, y: 0.5 } } as { type: string; [key: string]: unknown });
        const config = world.getResource<PlatformerConfigType>("GameConfig") || DEFAULT_PLATFORMER_CONFIG;

        world.addComponent(entity, {
          type: "PlatformerMovementConfig",
          acceleration: config.PLAYER_ACCEL,
          maxSpeed: config.PLAYER_SPEED,
          deceleration: config.PLAYER_DECEL,
          airAcceleration: config.PLAYER_AIR_ACCEL,
          airDeceleration: config.PLAYER_AIR_DECEL
        } as { type: string; [key: string]: unknown });
        world.addComponent(entity, {
          type: "PlatformerInput",
          moveDir: 0,
          jumpPressed: false,
          jumpHeld: false,
          jumpReleased: false,
          dash: false
        } as { type: string; [key: string]: unknown });
        world.addComponent(entity, {
          type: "DashUnlocked",
          unlocked: true,
          dashSpeed: 500,
          cooldown: 0,
          cooldownMax: 0.8,
          dashTimeRemaining: 0
        } as { type: string; [key: string]: unknown });
        world.addComponent(entity, { type: "WallJumpUnlocked", unlocked: true } as { type: string; [key: string]: unknown });
        world.addComponent(entity, {
          type: "PlatformerGravityConfig",
          riseGravity: config.RISE_GRAVITY,
          fallGravity: config.FALL_GRAVITY,
          jumpVelocity: config.PLAYER_JUMP_VEL,
          minJumpVelocity: config.PLAYER_MIN_JUMP_VEL
        } as { type: string; [key: string]: unknown });
        world.addComponent(entity, {
          type: "PlatformerJumper",
          coyoteTimer: 0,
          jumpBufferTimer: 0,
          coyoteTimeMax: 0.15,
          jumpBufferMax: 0.1,
          maxJumps: 2,
          jumpsRemaining: 2
        } as { type: string; [key: string]: unknown });
        world.addComponent(entity, { type: "PlatformerGroundState", isGrounded: false, iceMultiplier: 1.0 } as { type: string; [key: string]: unknown });
        world.addComponent(entity, {
          type: "Animator",
          isPlaying: true,
          current: "idle",
          elapsed: 0,
          frame: 0,
          animations: {
            idle: { name: "idle", frameRate: 4, loop: true, frames: [0, 1] },
            run: { name: "run", frameRate: 8, loop: true, frames: [2, 3, 4, 5] },
            jump: { name: "jump", frameRate: 6, loop: false, frames: [6] },
            fall: { name: "fall", frameRate: 6, loop: false, frames: [7] }
          }
        } as { type: string; [key: string]: unknown });
      }
    });

    this.blueprints.register("tilemap", {
      spawn: (world, entity, args: { data: number[][]; tileDefinitions: any }) => {
        const config = world.getResource<PlatformerConfigType>("GameConfig") || DEFAULT_PLATFORMER_CONFIG;
        EntityBuilder.fromEntity(world, entity)
          .withTransform({ x: 0, y: 0 });

        world.addComponent(entity, {
          type: "Tilemap",
          data: args.data,
          tileSize: config.TILE_SIZE,
          tileDefinitions: args.tileDefinitions
        } as { type: string; [key: string]: unknown });
      }
    });

    // Add Systems
    this.world.addSystem(new PlatformerInputSystem(), { phase: SystemPhase.Input });
    this.world.addSystem(new PlatformerDashSystem(), { phase: SystemPhase.Input });
    // TODO(refactor): código duplicado detectado (bloque) con echorunner/EchoRunnerGame.ts:402-407. Considerar extraer a función compartida. Ref: 584bc078
    this.world.addSystem(new PlatformerWallJumpSystem(), { phase: SystemPhase.Simulation });
    this.world.addSystem(new PlatformerMovementSystem(), { phase: SystemPhase.Simulation });
    this.world.addSystem(new PlatformerGravitySystem(), { phase: SystemPhase.Simulation });
    this.world.addSystem(new PlatformerCoyoteSystem(), { phase: SystemPhase.Simulation });
    this.world.addSystem(new EnemySensorSystem(), { phase: SystemPhase.Simulation });
    this.world.addSystem(new StateMachineSystem(), { phase: SystemPhase.Simulation });
    this.world.addSystem(new CheckpointSystem(), { phase: SystemPhase.Simulation });
    this.world.addSystem(new DeathSystem(), { phase: SystemPhase.Simulation });
    this.world.addSystem(new RespawnSystem(), { phase: SystemPhase.Simulation });
    this.world.addSystem(new PlatformerDamageSystem(), { phase: SystemPhase.Simulation });
    // TODO(refactor): código duplicado detectado (bloque) con echorunner/EchoRunnerGame.ts:414-420. Considerar extraer a función compartida. Ref: 14b9d33b
    this.world.addSystem(new TTLSystem(), { phase: SystemPhase.Simulation });
    this.world.addSystem(new PhysicsIntegrateSystem(), { phase: SystemPhase.Simulation, priority: -10 });
    this.world.addSystem(new TileCollisionSystem(), { phase: SystemPhase.Collision });
    this.world.addSystem(new CollectibleSystem(), { phase: SystemPhase.Collision });
    this.world.addSystem(new PowerUpSystem() as any, { phase: SystemPhase.Collision });
    this.world.addSystem(new HitDetectionSystem(), { phase: SystemPhase.Collision });
    // TODO(refactor): código duplicado detectado (bloque) con echorunner/EchoRunnerGame.ts:420-425. Considerar extraer a función compartida. Ref: d0f615e5
    this.world.addSystem(new PlatformerGoalSystem(), { phase: SystemPhase.Simulation });
    this.world.addSystem(new Camera2DSystem(), { phase: SystemPhase.Presentation });
    this.world.addSystem(new TilemapRenderSystem(), { phase: SystemPhase.Presentation });
    this.world.addSystem(new AnimationSystem(), { phase: SystemPhase.Presentation });

    await this.onPreloadAssets();
  }

  public initializeRenderer(renderer: Renderer<any, any>): void {
    renderer.registerShape("player", drawPlatformerPlayer);
    renderer.registerShape("goal", drawPlatformerGoal);
    renderer.registerShape("fragment", drawMemoryFragment);
    renderer.registerShape("node", drawCheckpointNode);
    renderer.registerShape("sentinel", drawSentinel);
    renderer.registerShape("hopper", drawHopper);
    renderer.registerShape("charger", drawCharger);
  }

  protected override async onInitializeEntities(): Promise<void> {
    // TODO(refactor): código duplicado detectado (bloque) con echorunner/EchoRunnerGame.ts:489-506. Considerar extraer a función compartida. Ref: cc474bd4
    const tileDefinitions = {
      1: { solid: true, kind: "normal" as const },
      2: { solid: true, kind: "ice" as const },
      3: { solid: true, kind: "bounce" as const, bounce: 1.2 },
      4: { solid: true, kind: "spike" as const },
      5: { solid: true, oneWay: true, kind: "normal" as const }
    };

    const levelData = this.customLevelData ?? defaultLevelData;
    const templates = levelData.templates as SegmentTemplate[];
    const grammar = levelData.grammar as string[];
    const levelSeed = this.getSeed() || 41873;
    this.levelPlan = SegmentGenerator.generatePlan(templates, grammar, levelSeed);

    const config = this.world.getResource<PlatformerConfigType>("GameConfig") || DEFAULT_PLATFORMER_CONFIG;
    this.world.setResource("PlayerStartPoint", { x: 100, y: 350 });
    SegmentGenerator.instantiatePlan(this.world, this.levelPlan, config.TILE_SIZE, tileDefinitions);
    this.world.flush();

    // Spawn player
    const playerEntity = this.world.createEntity();
    this.blueprints.get("player")?.spawn(this.world as any, playerEntity, { x: 100, y: 350 });

    // Spawn Main Follow Camera
    // TODO(refactor): código duplicado detectado (bloque) con echorunner/EchoRunnerGame.ts:518-532. Considerar extraer a función compartida. Ref: 8ccc715b
    const cameraEntity = this.world.createEntity();
    this.world.addComponent(cameraEntity, {
      type: "Camera2D",
      zoom: 1.0,
      x: 0,
      y: 0,
      targetX: 0,
      targetY: 0,
      isMain: true,
      followEntity: playerEntity,
      lookAheadX: 80,
      smoothingX: 6.0,
      smoothingY: 6.0,
      verticalDeadzone: 45
    });
  }

  private async onPreloadAssets(): Promise<void> {
    const assets = [
      { id: "jump", path: "/audio/flap.mp3" },
      { id: "hit", path: "/audio/hit.mp3" },
      { id: "score", path: "/audio/score.mp3" },
      { id: "game_over", path: "/audio/game_over.mp3" }
    ];
    for (const asset of assets) {
      try {
        await this.audio.loadSFX(asset.id, asset.path);
      } catch (e) {
        // Fallback for environment constraints
      }
    }
  }

  public override update(dt: number): void {
    if (this.gameOver) return;

    const runState = this.world.getResource<RunState>("RunState");
    if (runState) {
      runState.elapsedTime += dt;
    }

    this.world.update(dt);
  }

  public override setInputState(input: Partial<PlatformerInput>): void {
    mutatePlatformerInputState(this.getWorld(), input);
  }

  public getGameState(): PlatformerGameState {
    const runState = this.world.getResource<RunState>("RunState");
    const score = runState ? runState.collectedTemporalIds.length * 10 + runState.collectedPermanentIds.length * 100 : 0;
    const lives = runState ? runState.lives : 3;
    const attempts = runState ? runState.attempt : 1;

    return {
      type: "PlatformerGameState",
      score,
      lives,
      attempts,
      isGameOver: this.gameOver
    };
  }

  public isGameOver(): boolean {
    return this.gameOver;
  }
}

export const PlatformerDefinition: GameDefinition = {
  name: "platformer",
  createSimulation: (seed: number) => {
    const game = new PlatformerGame({ gameOptions: { seed } });
    return game;
  },
  inputSchema: {
    actions: ["moveLeft", "moveRight", "jump", "dash"]
  },
  assets: {
    sprites: [],
    sounds: []
  }
};
