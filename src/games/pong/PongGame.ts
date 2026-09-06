/* eslint-disable @typescript-eslint/no-require-imports */
import {
  BaseGame,
  MovementSystem,
  BoundarySystem,
  JuiceSystem,
  ScreenShakeSystem,
  RenderUpdateSystem,
  AssetLoader,
  CollisionSystem2D,
  ConfigService,
  Renderer,
  RendererUtils,
  MutatorSystem,
  SystemPhase,
  ServerUpdatePayload,
  HierarchySystem,
  TTLSystem,
  World,
  WebAudioPlayer,
  System
} from "@tiny-aster/core";
import { PongCollisionSystem } from "./systems/PongCollisionSystem";
import { PongGameStateSystem } from "./systems/PongGameStateSystem";
import { ComboSystem } from "@tiny-aster/core";
import { AchievementSystem } from "@tiny-aster/gameplay-kit";
import { BENEFICIAL_MUTATORS, registerMutatorHook } from "../../utils/MutatorRegistry";
import { resolveAndApplyMutators } from "../../config/MutatorConfig";
import { PongVelocityGuardrailSystem } from "./systems/PongVelocityGuardrailSystem";

registerMutatorHook((world: World, mutatorId: string) => {
  if (mutatorId === "extra_life") {
    if (world.getSingleton("PongState" as any)) {
      world.mutateSingleton("PongState" as any, (gs: any) => {
        if (typeof gs.scoreP1 === "number" && gs.scoreP1 === 0) {
          gs.scoreP1 = 1;
        }
      });
    }
  }
});
import { PongInputSystem } from "./systems/PongInputSystem";
import { PongSpinSystem } from "./systems/PongSpinSystem";
import { PongEntityFactory } from "./EntityFactory";
import { NetworkController } from "./input/NetworkController";
import { type PongState, type PongInput, type PongComponentRegistry } from "./types";
import { PongConfigSchema, PongConfig, DEFAULT_PONG_CONFIG } from "./types/PongConfigSchema";
import { CollisionLayers } from "@tiny-aster/gameplay-kit";
import * as SharedVFX from "../shared/rendering/SharedVFX";
import { createThemeFromGameAccents } from "../../theme/gameAccents";
import pongConfigRaw from "./config/pong.json";

export type PongMode = "local" | "ai" | "online";

/**
 * Controlador principal del juego Pong.
 *
 * @remarks
 * Implementa una física de rebotes basada en el ángulo de incidencia y el movimiento
 * relativo de las paletas (spin). Gestiona modos de juego contra IA o multijugador local.
 */
import { TransformComponent, VelocityComponent, ColliderComponent, BoundaryComponent, CircleShape, BoxShape, ShapeType, BlueprintDefinition, Theme, resolveThemeColor, EntityBuilder } from "@tiny-aster/core";

export interface PongBlueprintMap extends Record<string, BlueprintDefinition<PongComponentRegistry, any, any>> {
  ball: BlueprintDefinition<PongComponentRegistry, any, {}>;
  paddle: BlueprintDefinition<PongComponentRegistry, any, { side: "left" | "right" }>;
  state: BlueprintDefinition<PongComponentRegistry, any, {}>;
}

export class PongGame extends BaseGame<PongState, PongInput, PongComponentRegistry, any, PongBlueprintMap> {
  private stateSystem!: PongGameStateSystem;
  private assetLoader: AssetLoader;
  private networkController?: NetworkController;
  public readonly gameId = "pong";
  private baseConfig: PongConfig;
  private config!: PongConfig;

  private stallStartTime = 0;
  private isStalled = false;

  constructor(config: { isMultiplayer?: boolean, seed?: number, gameOptions?: Record<string, unknown>, mode?: PongMode, assetProvider?: any, audio?: any, theme?: Theme } | PongMode = "local") {
    const isConfig = typeof config === "object" && config !== null;
    const mode = isConfig
      ? (config.gameOptions?.mode as PongMode || config.mode || "local")
      : config;
    const isMultiplayer = isConfig ? config.isMultiplayer : false;
    const seed = isConfig ? (config.gameOptions?.seed as number || config.seed) : undefined;
    const assetProvider = isConfig ? config.assetProvider : undefined;
    const audio = isConfig ? config.audio : undefined;
    const theme = isConfig && config.theme ? config.theme : createThemeFromGameAccents("pong");

    super({
      pauseKey: "Escape",
      isMultiplayer,
      assetProvider,
      theme,
      gameOptions: { mode, seed, ...((isConfig && config.gameOptions) || {}) },
      audio: audio || new WebAudioPlayer()
    });
    this.baseConfig = ConfigService.load<PongConfig>(this.gameId, PongConfigSchema, pongConfigRaw);
    this.config = this.baseConfig;
    // TODO(refactor): código duplicado detectado (bloque) con flappybird/FlappyBirdGame.ts:60-66. Considerar extraer a función compartida. Ref: a8fa2796
    this.assetLoader = new AssetLoader(assetProvider);
  }

  protected override async onRegisterSystems(): Promise<void> {
    this.config = resolveAndApplyMutators(this.baseConfig, this._config.gameOptions);

    // TODO(refactor): código duplicado detectado (bloque) con flappybird/FlappyBirdGame.ts:76-84. Considerar extraer a función compartida. Ref: 75010e56
    this.world.setResource("GameConfig", this.config);
    this.setupCommonArcadeResources();
    this._config.gameOptions = { ...this._config.gameOptions, ...this.config };

    await this.onPreloadAssets();

    // Register blueprints
    this.blueprints.register("ball", {
      spawn: (world, entity, _args: {}) => {
        const config = world.getResource<PongConfig>("GameConfig") || DEFAULT_PONG_CONFIG;
        const tint = resolveThemeColor(world, "ball", "primary");

        EntityBuilder.fromEntity(world, entity)
          .withTransform({
            x: config.WIDTH / 2,
            y: config.HEIGHT / 2,
            dirty: true
          })
          .withVelocity({
            vx: config.BALL_SPEED_START,
            vy: config.BALL_SPEED_START * (world.gameplayRandom.next() > 0.5 ? 1 : -1)
          })
          .withRender({
            shape: "circle",
            size: config.BALL_SIZE,
            color: tint
          })
          .withCollider({
            shape: { type: ShapeType.Circle, radius: config.BALL_SIZE } as CircleShape,
            layer: CollisionLayers.PROJECTILE,
            mask: CollisionLayers.PLAYER,
            offsetX: 0,
            offsetY: 0
          })
          .withCollisionEvents();

        world.addComponent(entity, {
          type: "Boundary",
          width: config.WIDTH,
          height: config.HEIGHT,
          mode: "bounce",
          bounceX: false,
          bounceY: true
        } as BoundaryComponent);
        world.addComponent(entity, { type: "Tag", tags: ["Ball"] } as { type: string; [key: string]: unknown });
        world.addComponent(entity, { type: "Ball", spinFactor: 0, spinDecay: 0.02 } as { type: string; [key: string]: unknown });
      }
    });

    this.blueprints.register("paddle", {
      spawn: (world, entity, args: { side: "left" | "right" }) => {
        const config = world.getResource<PongConfig>("GameConfig") || DEFAULT_PONG_CONFIG;
        const tint = resolveThemeColor(world, args.side, "paddle", "primary");

        const x = args.side === "left" ? 40 : config.WIDTH - 40;
        const y = config.HEIGHT / 2;

        EntityBuilder.fromEntity(world, entity)
          .withTransform({ x, y })
          .withVelocity()
          .withRender({
            shape: "paddle",
            size: config.PADDLE_WIDTH,
            color: tint,
            order: 0,
            vertices: [
              { x: -config.PADDLE_WIDTH / 2, y: -config.PADDLE_HEIGHT / 2 },
              { x: config.PADDLE_WIDTH / 2, y: -config.PADDLE_HEIGHT / 2 },
              { x: config.PADDLE_WIDTH / 2, y: config.PADDLE_HEIGHT / 2 },
              { x: -config.PADDLE_WIDTH / 2, y: config.PADDLE_HEIGHT / 2 },
            ]
          } as any)
          .withCollider({
            shape: { type: ShapeType.Box, width: config.PADDLE_WIDTH, height: config.PADDLE_HEIGHT } as BoxShape,
            layer: CollisionLayers.PLAYER,
            mask: CollisionLayers.PROJECTILE
          });

        world.addComponent(entity, { type: "Tag", tags: ["Paddle", args.side] } as { type: string; [key: string]: unknown });
        world.addComponent(entity, { type: "Paddle", side: args.side, previousY: y, lastVelocityY: 0 } as { type: string; [key: string]: unknown });
      }
    });

    this.blueprints.register("state", {
      spawn: (world, entity, _args: {}) => {
        const hasShieldPulse = world.getResource("HasShieldPulse") === true;
        const initialScoreP1 = world.getResource("ExtraLifeScoreP1") === 1 ? 1 : 0;

        const comboObj = {
          type: "Combo",
          combo: 0,
          multiplier: 1,
          timerRemaining: 0,
          timerDuration: 2.0
        };

        world.addComponent(entity, {
          type: "PongState",
          scoreP1: initialScoreP1,
          scoreP2: 0,
          isGameOver: false,
          gameOverLogged: false,
          shieldPulseRemaining: hasShieldPulse ? 5.0 : 0.0,
          scoreFreezeRemaining: 0,
          lastScorer: null
        } as { type: string; [key: string]: unknown });
        world.addComponent(entity, {
          type: "Combo",
          combo: 0,
          multiplier: 1,
          timerRemaining: 0,
          timerDuration: 2.0
        } as { type: string; [key: string]: unknown });
      }
    });

    const mode = this._config.gameOptions?.mode || "local";
    const aiDifficulty = mode === "ai" ? "medium" : undefined;

    // Bind inputs for UnifiedInputSystem
    this.unifiedInput.bind("p1Up", ["KeyW"]);
    this.unifiedInput.bind("p1Down", ["KeyS"]);
    this.unifiedInput.bind("p2Up", ["ArrowUp"]);
    this.unifiedInput.bind("p2Down", ["ArrowDown"]);

    this.stateSystem = new PongGameStateSystem(this.config);
    if (this.unifiedInput instanceof System) {
      this.world.addSystem(this.unifiedInput as any, { phase: SystemPhase.Input });
    }

    if (mode === "online") {
      this.networkController = new NetworkController();
      this.world.addSystem(new PongInputSystem(undefined, this.networkController), { phase: SystemPhase.Simulation });
    } else {
      this.world.addSystem(new PongInputSystem(aiDifficulty as any), { phase: SystemPhase.Simulation });
    }

    this.world.addSystem(new MovementSystem(), { phase: SystemPhase.Simulation });
    this.world.addSystem(new PongSpinSystem(), { phase: SystemPhase.Simulation });
    this.world.addSystem(new BoundarySystem(), { phase: SystemPhase.Simulation });
    this.world.addSystem(new HierarchySystem(), { phase: SystemPhase.Transform });
    this.world.addSystem(new PongVelocityGuardrailSystem(), { phase: SystemPhase.Simulation });
    this.world.addSystem(new TTLSystem(), { phase: SystemPhase.Simulation });

    this.world.addSystem(new CollisionSystem2D(), { phase: SystemPhase.Collision });

    this.world.addSystem(new PongCollisionSystem(this.config), { phase: SystemPhase.GameRules });
    this.world.addSystem(this.stateSystem, { phase: SystemPhase.GameRules });
    this.world.addSystem(new ComboSystem(), { phase: SystemPhase.GameRules });
    this.world.addSystem(new AchievementSystem(), { phase: SystemPhase.Simulation });

    // TODO(refactor): código duplicado detectado (bloque) con echorunner/EchoRunnerGame.ts:424-429. Considerar extraer a función compartida. Ref: 6ae02dab
    const activeMutators = (this._config.gameOptions?.mutators || this._config.gameOptions?.activeMutators || []) as any[];
    this.world.addSystem(new MutatorSystem(activeMutators), { phase: SystemPhase.Simulation });

    // Visual / Presentation
    this.world.addSystem(new JuiceSystem(), { phase: SystemPhase.Presentation });
    this.world.addSystem(new ScreenShakeSystem(), { phase: SystemPhase.Presentation });
    this.world.addSystem(new RenderUpdateSystem(), { phase: SystemPhase.Presentation });
  }

  protected override async onInitializeEntities(): Promise<void> {
    // Temporarily unlock gameplayRandom for spawning initialization
    this.world.gameplayRandom.unlock();
    try {
      PongEntityFactory.createBall(this.world);
      PongEntityFactory.createPaddle(this.world, "left");
      PongEntityFactory.createPaddle(this.world, "right");
      PongEntityFactory.createGameState(this.world);


      // Apply active beneficial mutators
      const activeBeneficials = (this._config.gameOptions?.activeBeneficialMutators as string[]) || [];
      for (const mutatorId of activeBeneficials) {
        const mutator = BENEFICIAL_MUTATORS[mutatorId];
        if (mutator) {
          mutator.apply(this.world);
        }
      }
    } finally {
      this.world.gameplayRandom.lock();
    }
  }

  protected override async onBeforeRestart(): Promise<void> {
    this.stateSystem?.resetGameOverState(this.world);
  }

  public override update(dt: number): void {
    if (this.shouldStallSimulation()) {
      if (!this.isStalled) {
        this.isStalled = true;
        this.stallStartTime = Date.now();
      } else {
        const stalledDuration = Date.now() - this.stallStartTime;
        if (stalledDuration > 3000) {
          console.warn(`[PongGame] Simulation stalled: Waiting for server inputs for ${stalledDuration}ms`);
          this.eventBus.emit("simulation:stalled", { duration: stalledDuration });
        }
      }
      return;
    }

    if (this.isStalled) {
      this.isStalled = false;
      this.eventBus.emit("simulation:unstalled", {});
    }

    this.world.update(dt);
  }

  private async onPreloadAssets(): Promise<void> {
    const audio = this.audio;
    // TODO(refactor): código duplicado detectado (bloque) con flappybird/FlappyBirdGame.ts:304-317. Considerar extraer a función compartida. Ref: ed520f42
    const assets = [
      { id: "hit", path: "/audio/hit.mp3" },
      { id: "score", path: "/audio/score.mp3" },
      { id: "game_over", path: "/audio/game_over.mp3" },
    ];
    for (const asset of assets) {
      try {
        await audio.loadSFX(asset.id, asset.path);
      } catch (e) {
        console.error(`[Audio] Failed to load asset "${asset.id}" from "${asset.path}":`, e);
      }
    }
  }

  public initializeRenderer(renderer: Renderer<PongComponentRegistry, any>): void {
    RendererUtils.registerAssets(renderer, {
      canvas: (r) => {
        const { drawPongBall, drawPongPaddle, drawPongBackground } = require("./rendering/PongCanvasVisuals");
        r.registerShape("circle", drawPongBall); // Override default circle with spinning ball
        r.registerShape("paddle", drawPongPaddle); // Glowing neon paddles
        r.registerBackgroundEffect("pong_bg", drawPongBackground); // Custom grid grid background

        // Register standard fallback VFX too
        r.registerBackgroundEffect("crt_scanlines", SharedVFX.RetroCRTScanlinesEffect);
        r.registerBackgroundEffect("border_glow", SharedVFX.ScreenBorderGlowEffect);
        r.registerBackgroundEffect("crt_glitch", SharedVFX.CRTGlitchShudderEffect);
      },
      skia: (r) => {
        const { drawSkiaPongBall, drawSkiaPongPaddle, drawSkiaPongBackground } = require("./rendering/PongSkiaVisuals");
        r.registerShape("circle", drawSkiaPongBall);
        r.registerShape("paddle", drawSkiaPongPaddle);
        r.registerBackgroundEffect("pong_bg", drawSkiaPongBackground);

        // Register custom new VFX - Overlay CRT grid, screen glow, and glitching on the Pong board!
        r.registerBackgroundEffect("crt_scanlines", SharedVFX.SkiaRetroCRTScanlinesEffect);
        r.registerBackgroundEffect("border_glow", SharedVFX.SkiaScreenBorderGlowEffect);
        r.registerBackgroundEffect("crt_glitch", SharedVFX.SkiaCRTGlitchShudderEffect);
      }
    });
  }

  public getGameState(): PongState {
    const state = this.world.getSingleton("PongState");
    return state ? { ...state } : { type: "PongState", scoreP1: 0, scoreP2: 0, isGameOver: false, gameOverLogged: false };
  }

  public isGameOver(): boolean {
    return this.stateSystem?.isGameOver() ?? false;
  }

  protected shouldStallSimulation(): boolean {
    if (this.networkController) {
      const inputSystem = (this.world as any).systems?.find((s: any) => s.system instanceof PongInputSystem)?.system as PongInputSystem;
      return !this.networkController.hasInputForTick(inputSystem?.currentTick + 1 || 0);
    }
    return false;
  }

  public updateFromServer(payload: ServerUpdatePayload) {
    if (this._config.gameOptions?.mode !== "online" || !payload) return;

    if (payload.kind === "delta") {
      const state = payload as any;
      if (this.networkController && state.input_relay) {
          this.networkController.onInputReceived({
              tick: state.tick as number,
              input: state.input as PongInput
          });
      }
    }
  }
}

// ==========================================================================
// GAME-SPECIFIC MUTATOR HOOKS (DECOUPLED FROM CORE REGISTRY)
// ==========================================================================

registerMutatorHook("faster_bullets", (genericWorld) => {
  const world = genericWorld as unknown as World<PongComponentRegistry>;
  const config = world.getResource<Record<string, any>>("GameConfig");
  if (config && typeof config.PADDLE_SPEED === "number") {
    const newConfig = { ...config };
    newConfig.PADDLE_SPEED = Math.round(newConfig.PADDLE_SPEED * 1.15);
    world.setResource("GameConfig", newConfig);
  }
});

registerMutatorHook("extra_life", (world: World) => {
  world.setResource("ExtraLifeScoreP1", 1);
  const pongState = world.getSingleton("PongState");
  if (pongState) {
    world.mutateSingleton("PongState", (gs: any) => {
      if (typeof gs.scoreP1 === "number" && gs.scoreP1 === 0) {
        gs.scoreP1 = 1;
      }
    });
  }
});

export const PongDefinition = {
  name: "pong",
  createSimulation: (seed: number) => {
    const game = new PongGame({ gameOptions: { seed } });
    return game;
  },
  inputSchema: {
    actions: ["up", "down"]
  },
  assets: {
    sprites: [],
    sounds: []
  }
};
