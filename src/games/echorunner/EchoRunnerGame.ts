/* eslint-disable @typescript-eslint/no-require-imports */
import {
  BaseGame,
  World,
  System,
  ConfigService,
  SystemPhase,
  BlueprintDefinition,
  CoreComponentRegistry,
  WebAudioPlayer,
  EventBus,
  PhysicsIntegrateSystem,
  PlatformerMovementSystem,
  PlatformerGravitySystem,
  TileCollisionSystem,
  PlatformerCoyoteSystem,
  MovingPlatformSystem,
  PlatformCarrySystem,
  HitDetectionSystem,
  JuiceSystem,
  ScreenShakeSystem,
  RenderUpdateSystem,
  Camera2DSystem,
  TilemapRenderSystem,
  Renderer,
  TransformComponent,
  VelocityComponent,
  Collider2DComponent,
  TagComponent,
  HealthComponent,
  RenderComponent,
  RunState,
  CheckpointSystem,
  DeathSystem,
  RespawnSystem,
  CollectibleSystem,
  EnemySensorSystem,
  StateMachineSystem,
  registerEnemyStateMachines,
  SegmentTemplate,
  SegmentGenerator,
  LevelPlan,
  TTLComponent,
  EntityBuilder
} from "@tiny-aster/core";
import { drawEchoBackground, drawEchoPlayer, drawMemoryFragment, drawMemoryCore, drawCheckpointNode, drawPulseAttack, drawSentinel, drawHopper, drawWatcher, drawCharger } from "./rendering/EchoRunnerCanvasVisuals";
import { EchoRunnerInput, EchoRunnerGameState, ECHO_CONFIG } from "./types/EchoRunnerTypes";
import { EchoRunnerConfigSchema, EchoRunnerConfig as EchoRunnerConfigType, DEFAULT_ECHO_RUNNER_CONFIG } from "./types/EchoRunnerConfigSchema";
import { PlatformerInputSystem } from "../platformer/systems/PlatformerInputSystem";
import { resolveAndApplyMutators } from "../../config/MutatorConfig";
import { ArcadeEntityBuilder, registerPlatformerEnemyBlueprints, mutatePlatformerInputState } from "@tiny-aster/gameplay-kit";
import defaultLevelData from "./levels/level-01.json";

export interface EchoRunnerConfig {
  seed?: number;
  gameOptions?: Record<string, unknown>;
  levelData?: { templates: SegmentTemplate[]; grammar: string[] };
}

/**
 * System that manages triggering the Pulse attack and processing its cooldowns.
 */
class EchoRunnerAttackSystem extends System<CoreComponentRegistry> {
  public update(world: World<CoreComponentRegistry>, deltaTime: number): void {
    const players = world.query("PlatformerInput", "Transform");
    for (let i = 0; i < players.length; i++) {
      const player = players[i];
      const input = world.getComponent(player, "PlatformerInput") as any;
      const trans = world.getComponent(player, "Transform")!;

      // Manage attack cooldowns
      let cd = input.pulseCooldown ?? 0;
      if (cd > 0) {
        cd -= deltaTime;
        if (cd < 0) cd = 0;
        world.mutateComponent(player, "PlatformerInput" as any, (inp: any) => {
          inp.pulseCooldown = cd;
        });
      }

      // Read trigger and fire!
      if (input.pulsePressed && cd <= 0) {
        world.mutateComponent(player, "PlatformerInput" as any, (inp: any) => {
          inp.pulseCooldown = 0.45; // Cooldown of 0.45s
        });

        // Determine direction of attack
        const vel = world.getComponent(player, "Velocity")!;
        let dir = 1;
        if (vel.vx !== 0) {
          dir = vel.vx > 0 ? 1 : -1;
        } else if (trans.scaleX < 0) {
          dir = -1;
        }

        // Play sound
        const audio = world.getResource<any>("AudioPlayer") || (world as any).audio;
        if (audio) {
          audio.playSFX("pulse");
        }

        // Spawn pulse attack hitbox child entity via deferred commands
        world.commands.spawnFromBlueprint("pulse_hitbox" as any, {
          dir,
          x: trans.x,
          y: trans.y,
          parent: player
        } as any);

        // Clear pulse triggers
        world.mutateComponent(player, "PlatformerInput" as any, (inp: any) => {
          inp.pulsePressed = false;
        });
      }
    }
  }
}

/**
 * System that handles damage when player overlaps an enemy or spikes.
 */
class EchoRunnerDamageSystem extends System<CoreComponentRegistry> {
  public update(world: World<CoreComponentRegistry>, deltaTime: number): void {
    // TODO(refactor): código duplicado detectado (bloque) con platformer/systems/PlatformerDamageSystem.ts:7-30. Considerar extraer a función compartida. Ref: 72e3e047
    const players = world.query("PlatformerInput", "Health", "Transform");
    const enemies = world.query("Enemy", "Transform");

    for (let p = 0; p < players.length; p++) {
      const player = players[p];
      const pHealth = world.getComponent(player, "Health")!;
      const pTrans = world.getComponent(player, "Transform")!;

      // Handle invulnerability blink timers
      let invRemaining = pHealth.invulnerableRemaining ?? 0;
      if (invRemaining > 0) {
        invRemaining -= deltaTime;
        if (invRemaining < 0) invRemaining = 0;
        world.mutateComponent(player, "Health", (h) => {
          h.invulnerableRemaining = invRemaining;
        });
      }

      if (invRemaining > 0) continue;

      // Contact check with all active enemies
      let hit = false;
      for (let e = 0; e < enemies.length; e++) {
        const enemy = enemies[e];
        const eTrans = world.getComponent(enemy, "Transform")!;

        const dx = player !== undefined ? pTrans.x - eTrans.x : 0;
        const dy = player !== undefined ? pTrans.y - eTrans.y : 0;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // If very close, trigger damage
        if (dist < 20) {
          hit = true;
          break;
        }
      }

      if (hit) {
        // Apply damage to player
        world.mutateComponent(player, "Health", (h) => {
          h.current--;
          h.invulnerableRemaining = 1.0; // 1 second invulnerability
        });
        world.mutateComponent(player, "Render", (r) => {
          r.hitFlashFrames = 8;
        });

        // Request Screenshake
        const cameras = world.query("Camera2D");
        for (let c = 0; c < cameras.length; c++) {
          world.commands.addComponent(cameras[c], {
            type: "ScreenShake",
            intensity: 12,
            duration: 0.25,
            remaining: 0.25
          });
        }

        // Play SFX
        const audio = world.getResource<any>("AudioPlayer") || (world as any).audio;
        if (audio) {
          audio.playSFX("hit");
        }
      }
    }
  }
}

export class EchoRunnerGame extends BaseGame<EchoRunnerGameState, EchoRunnerInput, CoreComponentRegistry, any, any> {
  public readonly gameId = "echorunner";
  private gameOver = false;
  private levelPlan!: LevelPlan;
  private customLevelData?: { templates: SegmentTemplate[]; grammar: string[] };
  private baseConfig: EchoRunnerConfigType;
  private config: EchoRunnerConfigType;

  constructor(config: EchoRunnerConfig = {}) {
    super({
      pauseKey: "KeyP",
      restartKey: "KeyR",
      gameOptions: config.gameOptions,
      seed: config.seed,
      audio: new WebAudioPlayer()
    });
    this.baseConfig = ConfigService.load<EchoRunnerConfigType>(
      this.gameId,
      EchoRunnerConfigSchema,
      config.gameOptions?.rawConfig ?? {}
    );
    this.config = this.baseConfig;
    // TODO(refactor): código duplicado detectado (bloque) con platformer/PlatformerGame.ts:107-114. Considerar extraer a función compartida. Ref: d29aace1
    this.customLevelData = config.levelData ?? (config.gameOptions?.levelData as { templates: SegmentTemplate[]; grammar: string[] } | undefined);
  }

  // TODO(refactor): código duplicado detectado (método) con platformer/PlatformerGame.ts:227-251. Considerar extraer a función compartida. Ref: d39ade6b
  protected override async onRegisterSystems(): Promise<void> {
    this.config = resolveAndApplyMutators(this.baseConfig, this._config.gameOptions);

    this.world.setResource("GameConfig", this.config);
    // TODO(refactor): código duplicado detectado (bloque) con platformer/PlatformerGame.ts:114-127. Considerar extraer a función compartida. Ref: 44f1ee7d
    this.setupCommonArcadeResources();
    this.world.setResource("DeathPlaneY", 650);

    // Initializing high-fidelity RunState resource
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

    // Register blueprints
    this.blueprints.register("pulse_hitbox", {
      spawn: (world, entity, args: { dir: number; x: number; y: number; parent: number }) => {
        ArcadeEntityBuilder.fromEntity(world, entity)
          .withTransform({
            x: args.dir * 25,
            y: 0,
            worldX: args.x + args.dir * 25,
            worldY: args.y,
            parentEntity: args.parent
          })
          .withCollider2D({
            shape: { type: "aabb", halfWidth: 15, halfHeight: 15 },
            layer: 1 << 3,
            mask: 1 << 4,
            isTrigger: true
          })
          .withCollisionEvents()
          .withTTL(0.15)
          .withRender({
            shape: "pulse_attack",
            size: 30,
            order: 5,
            rotation: args.dir < 0 ? Math.PI : 0
          });

        // TODO(refactor): código duplicado detectado (bloque) con platformer/PlatformerGame.ts:288-293. Considerar extraer a función compartida. Ref: 30c73994
        world.addComponent(entity, { type: "Hitbox", hitEntities: [] } as { type: string; [key: string]: unknown });
      }
    });

    this.blueprints.register("player", {
      spawn: (world, entity, args: { x: number; y: number }) => {
        ArcadeEntityBuilder.fromEntity(world, entity)
          .withTransform({ x: args.x, y: args.y })
          .withVelocity()
          .withCollider2D({
            shape: { type: "aabb", halfWidth: 10, halfHeight: 15 },
            layer: 1,
            mask: 0xffff,
            enabled: true,
            isTrigger: false
          })
          .withRender({ shape: "player", size: 24, order: 2 })
          .withCollisionEvents();

        world.addComponent(entity, { type: "Health", current: 3, max: 3 } as HealthComponent);
        world.addComponent(entity, { type: "Tag", tags: ["TileCollider", "Player"] } as any);
        world.addComponent(entity, { type: "Hurtbox" } as { type: string; [key: string]: unknown });
        const config = world.getResource<EchoRunnerConfigType>("GameConfig") || DEFAULT_ECHO_RUNNER_CONFIG;

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
          pulsePressed: false,
          pulseCooldown: 0
        } as { type: string; [key: string]: unknown });
        world.addComponent(entity, {
          type: "PlatformerGravityConfig",
          riseGravity: config.RISE_GRAVITY,
          fallGravity: config.FALL_GRAVITY,
          jumpVelocity: config.PLAYER_JUMP_VEL,
          minJumpVelocity: config.PLAYER_MIN_JUMP_VEL,
          apexThreshold: config.APEX_THRESHOLD,
          apexGravityMultiplier: config.APEX_GRAVITY_MULTIPLIER
        } as { type: string; [key: string]: unknown });
        world.addComponent(entity, {
          type: "PlatformerJumper",
          coyoteTimer: 0,
          jumpBufferTimer: 0,
          coyoteTimeMax: config.COYOTE_TIME_MAX,
          jumpBufferMax: config.JUMP_BUFFER_MAX
        } as { type: string; [key: string]: unknown });
        // TODO(refactor): código duplicado detectado (bloque) con platformer/PlatformerGame.ts:362-374. Considerar extraer a función compartida. Ref: b8cff4cf
        world.addComponent(entity, { type: "PlatformerGroundState", isGrounded: false, iceMultiplier: 1.0 } as { type: string; [key: string]: unknown });
      }
    });

    this.blueprints.register("tilemap", {
      spawn: (world, entity, args: { data: number[][]; tileDefinitions: any }) => {
        const config = world.getResource<EchoRunnerConfigType>("GameConfig") || DEFAULT_ECHO_RUNNER_CONFIG;
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

    this.blueprints.register("collectible_fragment", {
      spawn: (world, entity, args: { x: number; y: number; id: string }) => {
        // TODO(refactor): código duplicado detectado (bloque) con platformer/PlatformerGame.ts:189-208. Considerar extraer a función compartida. Ref: fbd854ae
        EntityBuilder.fromEntity(world, entity)
          .withTransform({ x: args.x, y: args.y })
          .withRender({ shape: "fragment", size: 16, order: 1 });

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

    this.blueprints.register("collectible_core", {
      spawn: (world, entity, args: { x: number; y: number; id: string }) => {
        EntityBuilder.fromEntity(world, entity)
          .withTransform({ x: args.x, y: args.y })
          .withRender({ shape: "core", size: 24, order: 1 });

        world.addComponent(entity, {
          type: "Collectible",
          kind: "core",
          value: 100,
          persistent: true,
          collectOnce: true,
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

    this.blueprints.register("moving_platform", {
      spawn: (world, entity, args: { x: number; y: number; ampX: number; ampY: number; freq: number }) => {
        ArcadeEntityBuilder.fromEntity(world, entity)
          .withTransform({ x: args.x, y: args.y })
          .withVelocity()
          .withCollider2D({
            shape: { type: "aabb", halfWidth: 30, halfHeight: 10 },
            layer: 2
          })
          .withRender({ shape: "paddle", size: 60, order: 1 });

        world.addComponent(entity, {
          type: "MovingPlatform",
          pattern: "sine",
          startX: args.x,
          startY: args.y,
          amplitudeX: args.ampX,
          amplitudeY: args.ampY,
          frequency: args.freq,
          elapsed: 0
        } as { type: string; [key: string]: unknown });
      }
    });

    // Register State Machine Behaviors
    registerEnemyStateMachines(this.world);

    // Register all platformer & combat systems
    this.world.addSystem(new PlatformerInputSystem(), { phase: SystemPhase.Input });
    // TODO(refactor): código duplicado detectado (bloque) con platformer/PlatformerGame.ts:383-387. Considerar extraer a función compartida. Ref: 584bc078
    this.world.addSystem(new EchoRunnerAttackSystem(), { phase: SystemPhase.Input });

    this.world.addSystem(new PlatformerMovementSystem(), { phase: SystemPhase.Simulation });
    this.world.addSystem(new PlatformerGravitySystem(), { phase: SystemPhase.Simulation });
    this.world.addSystem(new PlatformerCoyoteSystem(), { phase: SystemPhase.Simulation });
    this.world.addSystem(new MovingPlatformSystem(), { phase: SystemPhase.Simulation });
    // TODO(refactor): código duplicado detectado (bloque) con platformer/PlatformerGame.ts:386-392. Considerar extraer a función compartida. Ref: 17f2bdf2
    this.world.addSystem(new PlatformCarrySystem(), { phase: SystemPhase.Simulation });
    this.world.addSystem(new EnemySensorSystem(), { phase: SystemPhase.Simulation });
    this.world.addSystem(new StateMachineSystem(), { phase: SystemPhase.Simulation });
    this.world.addSystem(new CheckpointSystem(), { phase: SystemPhase.Simulation });
    this.world.addSystem(new DeathSystem(), { phase: SystemPhase.Simulation });
    this.world.addSystem(new RespawnSystem(), { phase: SystemPhase.Simulation });
    // TODO(refactor): código duplicado detectado (bloque) con platformer/PlatformerGame.ts:393-397. Considerar extraer a función compartida. Ref: 14b9d33b
    this.world.addSystem(new EchoRunnerDamageSystem(), { phase: SystemPhase.Simulation });

    this.world.addSystem(new PhysicsIntegrateSystem(), { phase: SystemPhase.Simulation, priority: -10 });

    this.world.addSystem(new TileCollisionSystem(), { phase: SystemPhase.Collision });
    this.world.addSystem(new CollectibleSystem(), { phase: SystemPhase.Collision });
    // TODO(refactor): código duplicado detectado (bloque) con platformer/PlatformerGame.ts:399-402. Considerar extraer a función compartida. Ref: d0f615e5
    this.world.addSystem(new HitDetectionSystem(), { phase: SystemPhase.Collision });

    // Presentation Systems
    this.world.addSystem(new Camera2DSystem(), { phase: SystemPhase.Presentation });
    // TODO(refactor): código duplicado detectado (bloque) con pong/PongGame.ts:261-267. Considerar extraer a función compartida. Ref: 6ae02dab
    this.world.addSystem(new TilemapRenderSystem(), { phase: SystemPhase.Presentation });
    this.world.addSystem(new JuiceSystem(), { phase: SystemPhase.Presentation });
    this.world.addSystem(new ScreenShakeSystem(), { phase: SystemPhase.Presentation });
    this.world.addSystem(new RenderUpdateSystem(), { phase: SystemPhase.Presentation });

    await this.onPreloadAssets();

    // Listen to Hit Detection events
    const eventBus = this.world.getEventBus();
    if (eventBus) {
      eventBus.on("hitbox:hit", (event: any) => {
        const victim = event.victim;
        const attacker = event.attacker;

        // If player hits an enemy
        if (attacker && this.world.hasComponent(attacker, "PlatformerInput") && victim && this.world.hasComponent(victim, "Enemy")) {
          // Reduce health of enemy (most enemies have 1 health, so they explode!)
          if (this.world.hasComponent(victim, "Health")) {
            this.world.mutateComponent(victim, "Health", (h) => {
              h.current--;
            });
            this.world.mutateComponent(victim, "Render", (r) => {
              r.hitFlashFrames = 8;
            });

            // Play hit/kill sound
            this.audio.playSFX("explosion");

            // Trigger screenshake
            const cameras = this.world.query("Camera2D");
            for (let c = 0; c < cameras.length; c++) {
              this.world.commands.addComponent(cameras[c], {
                type: "ScreenShake",
                intensity: 6,
                duration: 0.15,
                remaining: 0.15
              });
            }

            // Remove enemy if health is <= 0
            const enemyHealth = this.world.getComponent(victim, "Health")!;
            if (enemyHealth.current <= 0) {
              this.world.commands.removeEntity(victim);
            }
          }
        }
      });

      // Listen for collectible pickup to play score sound
      eventBus.on("CollectiblePickedUp", () => {
        this.audio.playSFX("score");
      });

      // Listen for player died to play game over/death sound
      eventBus.on("PlayerDied", () => {
        this.audio.playSFX("game_over");
      });
    }
  }

  protected override async onInitializeEntities(): Promise<void> {
    try {
      // TODO(refactor): código duplicado detectado (bloque) con platformer/PlatformerGame.ts:421-433. Considerar extraer a función compartida. Ref: cc474bd4
      const tileDefinitions = {
        1: { solid: true, kind: "normal" as const },
        2: { solid: true, kind: "ice" as const },
        3: { solid: true, kind: "bounce" as const, bounce: 1.5 },
        4: { solid: true, kind: "spike" as const },
        5: { solid: true, oneWay: true, kind: "normal" as const }
      };

    const levelData = this.customLevelData ?? defaultLevelData;
    const templates = levelData.templates as SegmentTemplate[];
    const grammar = levelData.grammar as string[];

    // Generate deterministic Plan using SegmentGenerator
    const levelSeed = this.getSeed() || 41873;
    this.levelPlan = SegmentGenerator.generatePlan(templates, grammar, levelSeed);

    // Set world resources
    this.world.setResource("PlayerStartPoint", { x: 100, y: 350 });

    // Instantiate Plan
    const config = this.world.getResource<EchoRunnerConfigType>("GameConfig") || DEFAULT_ECHO_RUNNER_CONFIG;
    SegmentGenerator.instantiatePlan(this.world, this.levelPlan, config.TILE_SIZE, tileDefinitions);

    // Spawn Player
    const playerEntity = this.world.createEntity();
    const playerBp = this.blueprints.get("player");
    if (playerBp) {
      playerBp.spawn(this.world as any, playerEntity, { x: 100, y: 350 });
    } else {
      throw new Error("[EchoRunnerGame] Blueprint 'player' is not registered.");
    }

    // Spawn Main Follow Camera centered on player
    // TODO(refactor): código duplicado detectado (bloque) con platformer/PlatformerGame.ts:441-455. Considerar extraer a función compartida. Ref: 8ccc715b
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

    // Flush all deferred commands from SegmentGenerator and blueprint spawns
    this.world.flush();
    } catch (err) {
      console.error("[EchoRunnerGame] Failed to initialize entities:", err);
      throw err instanceof Error ? err : new Error(`[EchoRunnerGame] Initialization error: ${String(err)}`);
    }
  }

  public override update(dt: number): void {
    const runState = this.world.getResource<any>("RunState");
    if (runState) {
      runState.elapsedTime += dt;
    }

    // Check level complete (Core collected)
    if (runState && runState.collectedPermanentIds.includes("archive_core_1")) {
      if (!this.gameOver) {
        this.gameOver = true;
        this.eventBus.emit("game:over", {
          state: this.getGameState()
        });
      }
    }

    this.world.update(dt);
  }

  public override setInputState(input: Partial<EchoRunnerInput>): void {
    mutatePlatformerInputState(this.getWorld(), input);
  }

  private async onPreloadAssets(): Promise<void> {
    const assets = [
      { id: "pulse", path: "/audio/shoot.mp3" },
      { id: "hit", path: "/audio/hit.mp3" },
      { id: "score", path: "/audio/score.mp3" },
      { id: "game_over", path: "/audio/game_over.mp3" },
      { id: "explosion", path: "/audio/explosion.mp3" }
    ];
    for (const asset of assets) {
      try {
        await this.audio.loadSFX(asset.id, asset.path);
      } catch (e) {
        // Fallback for environment constraints
      }
    }
  }

  public initializeRenderer(renderer: Renderer<any, any>): void {
    if (renderer.type === "canvas") {
      const {
        drawEchoBackground,
        drawEchoPlayer,
        drawMemoryFragment,
        drawMemoryCore,
        drawCheckpointNode,
        drawPulseAttack,
        drawSentinel,
        drawHopper,
        drawWatcher,
        drawCharger
      } = require("./rendering/EchoRunnerCanvasVisuals");

      renderer.registerBackgroundEffect("echo_bg", drawEchoBackground);
      renderer.registerShape("player", drawEchoPlayer);
      renderer.registerShape("fragment", drawMemoryFragment);
      renderer.registerShape("core", drawMemoryCore);
      renderer.registerShape("node", drawCheckpointNode);
      renderer.registerShape("pulse_attack", drawPulseAttack);
      renderer.registerShape("sentinel", drawSentinel);
      renderer.registerShape("hopper", drawHopper);
      renderer.registerShape("watcher", drawWatcher);
      renderer.registerShape("charger", drawCharger);
    } else if (renderer.type === "skia") {
      const {
        drawSkiaEchoBackground,
        drawSkiaEchoPlayer,
        drawSkiaMemoryFragment,
        drawSkiaMemoryCore,
        drawSkiaCheckpointNode,
        drawSkiaPulseAttack,
        drawSkiaSentinel,
        drawSkiaHopper,
        drawSkiaWatcher,
        drawSkiaCharger
      } = require("./rendering/EchoRunnerSkiaVisuals");

      renderer.registerBackgroundEffect("echo_bg", drawSkiaEchoBackground);
      renderer.registerShape("player", drawSkiaEchoPlayer);
      renderer.registerShape("fragment", drawSkiaMemoryFragment);
      renderer.registerShape("core", drawSkiaMemoryCore);
      renderer.registerShape("node", drawSkiaCheckpointNode);
      renderer.registerShape("pulse_attack", drawSkiaPulseAttack);
      renderer.registerShape("sentinel", drawSkiaSentinel);
      renderer.registerShape("hopper", drawSkiaHopper);
      renderer.registerShape("watcher", drawSkiaWatcher);
      renderer.registerShape("charger", drawSkiaCharger);
    }
  }

  public getGameState(): EchoRunnerGameState {
    const runState = this.world.getResource<any>("RunState");
    const score = runState ? runState.collectedTemporalIds.length * 10 + runState.collectedPermanentIds.length * 100 : 0;

    return {
      type: "EchoRunnerGameState",
      score,
      isGameOver: this.gameOver,
      attempts: runState ? runState.attempt : 1,
      deaths: runState ? runState.deaths : 0,
      fragments: runState ? runState.collectedTemporalIds.length : 0,
      cores: runState ? runState.collectedPermanentIds.length : 0,
      activeCheckpoint: runState ? runState.activeCheckpoint : null,
      elapsedTime: runState ? runState.elapsedTime : 0
    };
  }

  public isGameOver(): boolean {
    return this.gameOver;
  }
}

export const EchoRunnerDefinition = {
  name: "echorunner",
  createSimulation: (seed: number) => {
    return new EchoRunnerGame({ seed });
  },
  inputSchema: {
    actions: ["left", "right", "jump", "pulse"]
  },
  assets: {
    sprites: [],
    sounds: []
  }
};
