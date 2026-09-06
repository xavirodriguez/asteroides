import { BaseGame, WorldSnapshot, GameLoop, World, System, SystemPhase, InputSystem, MovementSystem, CollisionSystem2D, JuiceSystem, Renderer, EventBus, UnifiedInputSystem, MutatorSystem, NetworkManager, LocalPredictionSystem, RemoteInterpolationSystem, HierarchySystem, TTLSystem, WebAudioPlayer, ConfigService, NullBaseGame, loadAudioAssets } from "@tiny-aster/core";
import { FlappyBirdInput, FLAPPY_CONFIG, INITIAL_FLAPPY_STATE, FlappyBirdState, BirdComponent, PipeComponent, FlappyBirdComponentRegistry } from "./types/FlappyBirdTypes";
import { FlappyBirdConfigSchema, FlappyBirdConfig as FlappyBirdConfigType, DEFAULT_FLAPPY_BIRD_CONFIG } from "./types/FlappyBirdConfigSchema";
import { ComboSystem } from "@tiny-aster/core";
import { FlappyBirdGameStateSystem } from "./systems/FlappyBirdGameStateSystem";
import { FlappyBirdInputSystem } from "./systems/FlappyBirdInputSystem";
import { FlappyBirdCollisionSystem } from "./systems/FlappyBirdCollisionSystem";
import { FlappyBirdGlideSystem } from "./systems/FlappyBirdGlideSystem";
import { FlappyBirdRenderSystem } from "./systems/FlappyBirdRenderSystem";
import { IFlappyBirdGame } from "./types/GameInterfaces";
import { InputBufferSystem } from "./systems/FlappyBirdInputSystem";
import {
  createBird,
  createGameState,
  createGround
} from "./EntityFactory";
import { registerMutatorHook } from "../../utils/MutatorRegistry";
import { resolveAndApplyMutators } from "../../config/MutatorConfig";
import { AchievementSystem } from "@tiny-aster/gameplay-kit";

/**
 * Controlador principal del juego Flappy Bird.
 *
 * @remarks
 * Implementa mecánicas de scroll infinito y generación procedural de obstáculos (tuberías).
 * Utiliza un sistema de gravedad simple y una única acción de entrada ("jump").
 */
import { ColliderComponent, CollisionEventsComponent, ShapeType, CircleShape, BoxShape, BoundaryComponent, TransformComponent, VelocityComponent, RenderComponent, HealthComponent, BlueprintDefinition, createEmitter, Theme, resolveThemeColor, EntityBuilder } from "@tiny-aster/core";
import { CollisionLayers } from "@tiny-aster/gameplay-kit";
import { spawnVisualParticle as spawnCanvasParticle } from "./rendering/FlappyBirdCanvasVisuals";
import { spawnVisualParticle as spawnSkiaParticle } from "./rendering/FlappyBirdSkiaVisuals";
import { createThemeFromGameAccents } from "../../theme/gameAccents";

export interface FlappyBirdBlueprintMap extends Record<string, BlueprintDefinition<FlappyBirdComponentRegistry, any, any>> {
  bird: BlueprintDefinition<FlappyBirdComponentRegistry, any, { x: number, y: number }>;
  pipe: BlueprintDefinition<FlappyBirdComponentRegistry, any, { x: number, gapY: number }>;
  ground: BlueprintDefinition<FlappyBirdComponentRegistry, any, {}>;
  state: BlueprintDefinition<FlappyBirdComponentRegistry, any, {}>;
}

export class FlappyBirdGame
  extends BaseGame<FlappyBirdState, FlappyBirdInput, FlappyBirdComponentRegistry, any, FlappyBirdBlueprintMap>
  implements IFlappyBirdGame {

  private gameStateSystem!: FlappyBirdGameStateSystem;
  private networkManager!: NetworkManager<any>;
  public readonly gameId = "flappybird";
  private baseConfig: FlappyBirdConfigType;
  private config: FlappyBirdConfigType;
  public isMultiplayer = false;
  private activeRendererType: "canvas" | "skia" = "canvas";

  constructor(config: { isMultiplayer?: boolean, seed?: number, gameOptions?: Record<string, unknown>, audio?: any, theme?: Theme } = {}) {
    const seed = config.gameOptions?.seed as number || config.seed;
    super({
      pauseKey: DEFAULT_FLAPPY_BIRD_CONFIG.KEYS.PAUSE,
      restartKey: DEFAULT_FLAPPY_BIRD_CONFIG.KEYS.RESTART,
      isMultiplayer: config.isMultiplayer,
      theme: config.theme ?? createThemeFromGameAccents("flappy-bird"),
      gameOptions: { ...config.gameOptions, seed },
      audio: config.audio || new WebAudioPlayer()
    });
    this.baseConfig = ConfigService.load<FlappyBirdConfigType>(
      this.gameId,
      FlappyBirdConfigSchema,
      config.gameOptions?.rawConfig ?? {}
    );
    this.config = this.baseConfig;
    // TODO(refactor): código duplicado detectado (bloque) con pong/PongGame.ts:101-107. Considerar extraer a función compartida. Ref: a8fa2796
    this.isMultiplayer = !!config.isMultiplayer;
  }

  protected override async onRegisterSystems(): Promise<void> {
    this.config = resolveAndApplyMutators(this.baseConfig, this._config.gameOptions);
    // TODO(refactor): código duplicado detectado (bloque) con pong/PongGame.ts:109-118. Considerar extraer a función compartida. Ref: 75010e56
    this.world.setResource("GameConfig", this.config);
    this.setupCommonArcadeResources();
    this._config.gameOptions = { ...this._config.gameOptions, ...this.config };

    await this.onPreloadAssets();

    // Register blueprints
    this.blueprints.register("bird", {
      spawn: (world, entity, args: { x: number, y: number }) => {
        const config = world.getResource<FlappyBirdConfigType>("GameConfig") || DEFAULT_FLAPPY_BIRD_CONFIG;
        const tint = resolveThemeColor(world, "bird", "player");

        EntityBuilder.fromEntity(world, entity)
          .withTransform({ x: args.x, y: args.y })
          .withVelocity()
          .withRender({
            shape: "bird",
            size: config.BIRD_RADIUS,
            color: tint
          })
          .withCollider({
            shape: { type: ShapeType.Circle, radius: (config.BIRD_RADIUS - 2) * 0.85 } as CircleShape,
            layer: CollisionLayers.PLAYER,
            mask: CollisionLayers.ENEMY | CollisionLayers.DEBRIS,
            offsetX: 0,
            offsetY: 0
          })
          .withCollisionEvents();

        world.addComponent(entity, {
          type: "Bird",
          velocityY: 0,
          isAlive: true,
          isGliding: false,
          nearMissTimer: 0,
          coyoteTimer: 0,
        });
        world.addComponent(entity, {
          type: "FlappyInput",
          flap: false,
          glide: false,
          flapCooldownRemaining: 0,
        });
        world.addComponent(entity, {
          type: "Health",
          current: 1,
          max: 1,
          invulnerableRemaining: 0,
        } as HealthComponent);
        world.addComponent(entity, {
          type: "Combo",
          combo: 0,
          multiplier: 1,
          timerRemaining: 0,
          timerDuration: 2.0
        } as any);

        createEmitter(world as any, {
          type: "spawn",
          x: args.x,
          y: args.y,
          rate: 0,
          burst: true,
          count: 3,
          lifetime: [0.8, 1.2],
          speed: [20, 40],
          angle: [260, 280],
          size: [3, 5],
          color: ["#D3D9E2", "#00F3FF"],
          loop: false
        });
      }
    });

    this.blueprints.register("pipe", {
      spawn: (world, entity, args: { x: number, gapY: number }) => {
        const config = world.getResource<FlappyBirdConfigType>("GameConfig") || DEFAULT_FLAPPY_BIRD_CONFIG;
        const pipeColor = resolveThemeColor(world, "pipe", "enemy");

        const halfGap = config.GAP_SIZE / 2;
        const pipeWidth = config.PIPE_WIDTH;
        const pipeSpeed = config.PIPE_SPEED;

        // Top Pipe
        const topY = args.gapY - halfGap;
        EntityBuilder.fromEntity(world, entity)
          .withTransform({ x: args.x, y: topY / 2 })
          .withVelocity({ vx: -pipeSpeed, vy: 0 })
          .withRender({ shape: "pipe", size: pipeWidth, color: pipeColor, order: 0 })
          .withCollider({
            shape: { type: ShapeType.Box, width: pipeWidth, height: topY } as BoxShape,
            layer: CollisionLayers.ENEMY,
            mask: CollisionLayers.PLAYER
          })
          .withCollisionEvents();

        world.addComponent(entity, { type: "Pipe", gapY: args.gapY, gapSize: config.GAP_SIZE, scored: false });

        // Bottom Pipe
        const bottomY = args.gapY + halfGap;
        const bottomHeight = config.SCREEN_HEIGHT - bottomY;
        EntityBuilder.create(world)
          .withTransform({ x: args.x, y: bottomY + bottomHeight / 2 })
          .withVelocity({ vx: -pipeSpeed, vy: 0 })
          .withRender({ shape: "pipe", size: pipeWidth, color: pipeColor, order: 0 })
          .withCollider({
            shape: { type: ShapeType.Box, width: pipeWidth, height: bottomHeight } as BoxShape,
            layer: CollisionLayers.ENEMY,
            mask: CollisionLayers.PLAYER
          })
          .withCollisionEvents();

        world.addComponent(entity, { type: "Pipe", gapY: args.gapY, gapSize: config.GAP_SIZE, scored: true });
      }
    });

    this.blueprints.register("ground", {
      spawn: (world, entity, _args: {}) => {
        const config = world.getResource<FlappyBirdConfigType>("GameConfig") || DEFAULT_FLAPPY_BIRD_CONFIG;
        const groundColor = resolveThemeColor(world, "ground");

        EntityBuilder.fromEntity(world, entity)
          .withTransform({ x: config.SCREEN_WIDTH / 2, y: config.GROUND_Y })
          .withCollider({
            shape: { type: ShapeType.Box, width: config.SCREEN_WIDTH, height: config.SCREEN_HEIGHT - config.GROUND_Y } as BoxShape,
            layer: CollisionLayers.DEBRIS,
            mask: CollisionLayers.PLAYER
          })
          .withCollisionEvents()
          .withRender({ shape: "ground", size: config.SCREEN_WIDTH, color: groundColor, order: 0 });

        world.addComponent(entity, { type: "Ground" });
      }
    });

    this.blueprints.register("state", {
      spawn: (world, entity, _args: {}) => {
        world.addComponent(entity, {
          type: "FlappyState",
          score: 0,
          isGameOver: false,
          highScore: 0,
          pipeSpawnTimer: 0,
          gameOverLogged: false,
        });
      }
    });

    // Bind inputs for UnifiedInputSystem
    this.unifiedInput.bind("flap", [FLAPPY_CONFIG.KEYS.FLAP]);

    this.gameStateSystem = new FlappyBirdGameStateSystem(this, this.config);

    const inputSys = new FlappyBirdInputSystem(this.config);
    if (this.isMultiplayer) inputSys.setMultiplayerMode(true);

    if (this.unifiedInput instanceof System) {
      this.world.addSystem(this.unifiedInput as unknown as System<FlappyBirdComponentRegistry>, { phase: SystemPhase.Input });
    }
    this.world.addSystem(new InputBufferSystem(), { phase: SystemPhase.Simulation });
    this.world.addSystem(new ComboSystem(), { phase: SystemPhase.Simulation });
    this.world.addSystem(inputSys, { phase: SystemPhase.Simulation });
    this.world.addSystem(new FlappyBirdGlideSystem(), { phase: SystemPhase.Simulation });
    this.world.addSystem(new MovementSystem() as System<FlappyBirdComponentRegistry>, { phase: SystemPhase.Simulation });
    this.world.addSystem(new HierarchySystem() as System<FlappyBirdComponentRegistry>, { phase: SystemPhase.Transform });
    this.world.addSystem(new TTLSystem() as System<FlappyBirdComponentRegistry>, { phase: SystemPhase.Simulation });
    this.world.addSystem(new CollisionSystem2D() as System<FlappyBirdComponentRegistry>, { phase: SystemPhase.Collision });
    this.world.addSystem(new FlappyBirdCollisionSystem(this, this.config), { phase: SystemPhase.GameRules });
    this.world.addSystem(this.gameStateSystem, { phase: SystemPhase.GameRules });
    this.world.addSystem(new AchievementSystem() as System<FlappyBirdComponentRegistry>, { phase: SystemPhase.Simulation });

    const activeMutators = (this._config.gameOptions?.mutators || this._config.gameOptions?.activeMutators || []) as any[];
    this.world.addSystem(new MutatorSystem(activeMutators) as System<FlappyBirdComponentRegistry>, { phase: SystemPhase.Simulation });

    // Visual / Presentation
    this.world.addSystem(new JuiceSystem() as System<FlappyBirdComponentRegistry>, { phase: SystemPhase.Presentation });
    this.world.addSystem(new FlappyBirdRenderSystem(), { phase: SystemPhase.Presentation });

    // Register visual feedback listener for obstacle pipe clearance
    const eventBus = this.getEventBus();
    if (eventBus) {
      eventBus.on("pipe:passed", () => {
        const birdEntities = this.world.query("Bird", "Transform");
        if (birdEntities.length > 0) {
          const transform = this.world.getComponent(birdEntities[0], "Transform");
          if (transform) {
            const bx = transform.worldX ?? transform.x;
            const by = transform.worldY ?? transform.y;

            const spawnParticle = this.activeRendererType === "skia" ? spawnSkiaParticle : spawnCanvasParticle;

            const renderRandom = this.world.renderRandom;
            const count = 6 + renderRandom.nextInt(0, 3);
            for (let i = 0; i < count; i++) {
              const angle = renderRandom.next() * Math.PI * 2;
              const speed = renderRandom.nextRange(60, 150);
              const pvx = Math.cos(angle) * speed;
              const pvy = Math.sin(angle) * speed;
              const life = renderRandom.nextRange(0.3, 0.6);
              const size = renderRandom.nextRange(2.5, 4.5);
              const color = renderRandom.next() > 0.4 ? "#00F3FF" : "#FFFFFF"; // Cyan & white success sparks

              spawnParticle("spark", bx + 10, by, pvx, pvy, life, size, color, angle);
            }
          }
        }
      });
    }

    if (!this.networkManager) {
      this.networkManager = NetworkManager.registerGame(this.gameId, this, {
        strategy: 'snapshot',
        interpolationDelay: 100
      });
    }
    this.world.addSystem(new LocalPredictionSystem(this.networkManager, () => {}) as System<any>, { phase: SystemPhase.Input });
    this.world.addSystem(new RemoteInterpolationSystem(this.networkManager) as System<any>, { phase: SystemPhase.Presentation });
  }

  protected override async onInitializeEntities(): Promise<void> {
    if (this.isMultiplayer) return;
    const config = this.world.getResource<FlappyBirdConfigType>("GameConfig") || DEFAULT_FLAPPY_BIRD_CONFIG;
    createGameState(this.world);
    createBird({ world: this.world, x: config.BIRD_X, y: config.BIRD_START_Y });
    createGround(this.world);
  }

  protected override async onBeforeRestart(): Promise<void> {
    this.gameStateSystem?.resetGameOverState(this.world);
    if (this.isMultiplayer) {
      this.networkManager?.reset();
    }
  }

  public override update(dt: number): void {
      this.world.update(dt);
  }

  private async onPreloadAssets(): Promise<void> {
    const assets = [
      { id: "flap", path: "/audio/flap.mp3" },
      { id: "hit", path: "/audio/hit.mp3" },
      { id: "score", path: "/audio/score.mp3" },
      { id: "game_over", path: "/audio/game_over.mp3" },
    ];
    await loadAudioAssets(this.audio, assets);
  }

  public setMultiplayerMode(active: boolean) {
    this.isMultiplayer = active;
  }

  public override setInputState(input: any): void {
    const world = this.getWorld();
    const birdEntity = world.query("Bird")[0];
    if (birdEntity !== undefined) {
      if (!world.hasComponent(birdEntity, "FlappyInput")) {
        world.addComponent(birdEntity, {
          type: "FlappyInput",
          flap: false,
          glide: false,
          flapCooldownRemaining: 0,
        } as any);
      }
      world.mutateComponent(birdEntity, "FlappyInput", (inputComp: any) => {
        if (input && typeof input === "object" && input.axes) {
          const moveY = input.axes.moveY ?? 0;
          const actions = input.actions;
          const hasAction = (name: string) => actions instanceof Set ? actions.has(name) : !!actions?.includes?.(name);

          inputComp.flap = hasAction("confirm") || hasAction("fire") || moveY < 0;
          inputComp.glide = hasAction("boost") || moveY > 0;
        } else {
          if (input.flap !== undefined) {
            inputComp.flap = input.flap;
          }
          if (input.glide !== undefined) {
            inputComp.glide = input.glide;
          }
        }
      });
    }
  }

  public setInput(input: Partial<FlappyBirdInput>) {
    this.setInputState(input);
  }

  public updateFromServer(state: Record<string, unknown>) {
    if (!this.isMultiplayer || !state) return;
    // TODO(refactor): código duplicado detectado (bloque) con geometrywars/GeometryWarsGame.ts:163-170. Considerar extraer a función compartida. Ref: 4e9c55a5
    const world = this.getWorld();
    const commands = world.getCommandBuffer();
    const replicator = this.networkManager.getReplicator();

    const currentServerEntities = new Set<string>();

    if (state.players && typeof state.players === 'object') {
      // TODO(refactor): código duplicado detectado (bloque) con space-invaders/SpaceInvadersGame.ts:774-780. Considerar extraer a función compartida. Ref: 7a271799
      const players = state.players as Record<string, { x: number, y: number, alive: boolean, velocityY: number }>;
      Object.entries(players).forEach(([sessionId, playerState]) => {
        const serverId = `player_${sessionId}`;
        currentServerEntities.add(serverId);

        const entity = replicator.resolveEntity(serverId, world);
        if (!world.hasComponent(entity, "Transform")) {
          commands.addComponent(entity, { type: "Transform", x: playerState.x, y: playerState.y, rotation: 0, scaleX: 1, scaleY: 1, worldX: playerState.x, worldY: playerState.y, worldRotation: 0, worldScaleX: 1, worldScaleY: 1, dirty: false } as TransformComponent);
          commands.addComponent(entity, { type: "Render", shape: "bird", size: 15, color: "yellow", rotation: 0, visible: true, opacity: 1, order: 0, hitFlashFrames: 0, angularVelocity: 0 } as RenderComponent);
          commands.addComponent(entity, {
            type: "Bird",
            velocityY: playerState.velocityY,
            isAlive: playerState.alive,
            isGliding: false,
            nearMissTimer: 0
          } as BirdComponent);
        }

        world.mutateComponent(entity, "Bird", bird => {
          bird.isAlive = playerState.alive;
          bird.velocityY = playerState.velocityY;
        });

        world.mutateComponent(entity, "Render", render => {
          render.color = playerState.alive ? "yellow" : "gray";
        });
      });
    }

    if (state.pipes && typeof state.pipes === 'object') {
      const pipes = state.pipes as Record<string, { x: number, gapY: number, id: string }>;
      Object.entries(pipes).forEach(([id, pipeState]) => {
        const serverId = `pipe_${id}`;
        currentServerEntities.add(serverId);

        const entity = replicator.resolveEntity(serverId, world);
        if (!world.hasComponent(entity, "Transform")) {
          commands.addComponent(entity, { type: "Transform", x: pipeState.x, y: 0, rotation: 0, scaleX: 1, scaleY: 1, worldX: pipeState.x, worldY: 0, worldRotation: 0, worldScaleX: 1, worldScaleY: 1, dirty: false } as TransformComponent);
          commands.addComponent(entity, { type: "Render", shape: "pipe", size: 60, color: "green", rotation: 0, visible: true, opacity: 1, order: 0, hitFlashFrames: 0, angularVelocity: 0 } as RenderComponent);
          // TODO(refactor): código duplicado detectado (bloque) con geometrywars/GeometryWarsGame.ts:238-258. Considerar extraer a función compartida. Ref: 95603026
          commands.addComponent(entity, { type: "Pipe", gapY: pipeState.gapY, gapSize: 140, scored: false } as PipeComponent);
        }
      });
    }

    // Sync with NetworkManager for interpolation
    // TODO(refactor): código duplicado detectado (bloque) con space-invaders/SpaceInvadersGame.ts:761-773. Considerar extraer a función compartida. Ref: 6b235ffa
    const snapshot: WorldSnapshot = {
        tick: (state.tick as number) || 0,
        entities: [],
        componentData: { Transform: {} },
        stateVersion: 0,
        structureVersion: 0,
        seed: 0,
        nextEntityId: 0,
        freeEntities: []
    };

    if (state.players) {
        Object.entries(state.players).forEach(([sessionId, p]: [string, Record<string, unknown>]) => {
            // TODO(refactor): código duplicado detectado (bloque) con geometrywars/GeometryWarsGame.ts:264-271. Considerar extraer a función compartida. Ref: 879d9b3e
            const entityId = replicator.getLocalId(`player_${sessionId}`);
            if (entityId !== undefined) {
                snapshot.entities.push(entityId);
                snapshot.componentData["Transform"][entityId] = { type: "Transform", x: (p as any).x, y: (p as any).y, rotation: 0, scaleX: 1, scaleY: 1, worldX: (p as any).x, worldY: (p as any).y, worldRotation: 0, worldScaleX: 1, worldScaleY: 1, dirty: false };
            }
        });
    }
    if (state.pipes) {
        Object.entries(state.pipes).forEach(([id, p]: [string, Record<string, unknown>]) => {
            const entityId = replicator.getLocalId(`pipe_${id}`);
            if (entityId !== undefined) {
                snapshot.entities.push(entityId);
                // TODO(refactor): código duplicado detectado (bloque) con geometrywars/GeometryWarsGame.ts:276-296. Considerar extraer a función compartida. Ref: 8e72a4b2
                snapshot.componentData["Transform"][entityId] = { type: "Transform", x: (p as any).x, y: 0, rotation: 0, scaleX: 1, scaleY: 1, worldX: (p as any).x, worldY: 0, worldRotation: 0, worldScaleX: 1, worldScaleY: 1, dirty: false };
            }
        });
    }

    // TODO(refactor): código duplicado detectado (bloque) con space-invaders/SpaceInvadersGame.ts:842-865. Considerar extraer a función compartida. Ref: a1d6c8d1
    this.networkManager.processServerUpdate(snapshot.tick, snapshot);

    // Cleanup removed entities
    replicator.getMappings().forEach((entity: number, serverId: string) => {
      if (!currentServerEntities.has(serverId)) {
        commands.removeEntity(entity);
        replicator.removeMapping(serverId);
      }
    });

    if (!world.isUpdating) {
        world.flush();
    }
  }

  public initializeRenderer(renderer: Renderer<any, any>): void {
    if (renderer.type === "canvas") {
      this.activeRendererType = "canvas";
      const { drawFlappyBird, drawFlappyPipe, drawFlappyGround, scrollingBackgroundEffect } = require("./rendering/FlappyBirdCanvasVisuals");
      renderer.registerShape("bird", drawFlappyBird);
      renderer.registerShape("pipe", drawFlappyPipe);
      renderer.registerShape("ground", drawFlappyGround);
      renderer.registerBackgroundEffect("scrollingSky", scrollingBackgroundEffect);
    } else if (renderer.type === "skia") {
      this.activeRendererType = "skia";
      const { drawSkiaFlappyBird, drawSkiaFlappyPipe, drawSkiaFlappyGround, scrollingSkiaBackgroundEffect } = require("./rendering/FlappyBirdSkiaVisuals");
      renderer.registerShape("bird", drawSkiaFlappyBird);
      renderer.registerShape("pipe", drawSkiaFlappyPipe);
      renderer.registerShape("ground", drawSkiaFlappyGround);
      renderer.registerBackgroundEffect("scrollingSky", scrollingSkiaBackgroundEffect);
    }
  }

  public getGameState(): FlappyBirdState & { combo?: number; multiplier?: number; comboMultiplier?: number; comboTimerRemaining?: number } {
    const world = this.getWorld();
    const state = world.getSingleton("FlappyState");
    let combo = 0;
    let multiplier = 1;
    let comboTimerRemaining = 0;

    const comboEntities = world.query("Combo");
    if (comboEntities.length > 0) {
      const comboComp = world.getComponent(comboEntities[0], "Combo");
      if (comboComp) {
        combo = comboComp.combo ?? 0;
        multiplier = comboComp.multiplier ?? 1;
        comboTimerRemaining = Math.max(0, comboComp.timerRemaining ?? 0);
      }
    }

    const baseState = state ? { ...state } : { ...INITIAL_FLAPPY_STATE };
    return {
      ...baseState,
      combo,
      multiplier,
      comboMultiplier: multiplier,
      comboTimerRemaining
    };
  }

  public isGameOver(): boolean {
    return this.getGameState().isGameOver;
  }

  public getWorld(): World<FlappyBirdComponentRegistry> {
    return this.world;
  }
}

export class NullFlappyBirdGame extends NullBaseGame<FlappyBirdState, FlappyBirdInput, FlappyBirdComponentRegistry> implements IFlappyBirdGame {
  public isMultiplayer = false;
  public gameId = "flappybird";

  public override getGameState(): FlappyBirdState {
    return INITIAL_FLAPPY_STATE;
  }

  public setInput(input: Partial<FlappyBirdInput>): void {
    this.setInputState(input);
  }
}

// ==========================================================================
// GAME-SPECIFIC MUTATOR HOOKS (DECOUPLED FROM CORE REGISTRY)
// ==========================================================================

registerMutatorHook("combo_head_start", (world: World) => {
  const comboEntities = world.query("Combo");
  if (comboEntities.length > 0) {
    world.mutateComponent(comboEntities[0], "Combo", (c) => {
      c.combo = 5;
      c.multiplier = 2;
      c.timerRemaining = 999999;
    });
  }
});

registerMutatorHook("story_fragment", (world: World) => {
  const eventBus = world.getEventBus();
  if (eventBus) {
    eventBus.emit("story:beat_reached", { beatId: "flappybird_story_beat", dialogueReference: "story.chapter_1_fragment_2" });
  }
});

export const FlappyBirdDefinition = {
  name: "flappybird",
  createSimulation: (seed: number) => {
    const game = new FlappyBirdGame({ gameOptions: { seed } });
    return game;
  },
  inputSchema: {
    actions: ["flap", "glide"]
  },
  assets: {
    sprites: [],
    sounds: [
      { id: "flap", path: "/audio/flap.mp3" },
      { id: "hit", path: "/audio/hit.mp3" },
      { id: "score", path: "/audio/score.mp3" },
      { id: "game_over", path: "/audio/game_over.mp3" }
    ]
  }
};
