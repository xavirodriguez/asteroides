/* eslint-disable @typescript-eslint/no-require-imports */
import {
  World,
  GameLoop,
  BaseGame,
  BaseGameConfig,
  AssetLoader,
  JuiceSystem,
  MutatorSystem,
  SpatialPartitioningSystem,
  SpatialCullingSystem,
  RenderUpdateSystem,
  MovementSystem,
  BoundarySystem,
  FrictionSystem,
  ScreenShakeSystem,
  TTLSystem,
  InvulnerabilitySystem,
  CollisionSystem2D,
  CCDSystem,
  FeedbackSystem,
  TrailSystem,
  ParticleSystem,
  AnimationSystem,
  InputFrame,
  Renderer,
  RendererUtils,
  NetworkManager,
  NullTransport,
  LocalPredictionSystem,
  RemoteInterpolationSystem,
  NetworkController,
  computeShipPhysics,
  INetworkGame,
  ConfigService,
  SystemPhase,
  ServerUpdatePayload,
  TransformComponent,
  HierarchySystem,
  VelocityComponent,
  RenderComponent,
  HealthComponent,
  ColliderComponent,
  CollisionEventsComponent,
  TTLComponent,
  BoundaryComponent,
  WebAudioPlayer,
  WebAssetProvider,
  NullBaseGame
} from "@tiny-aster/core";

import { ComboSystem } from "@tiny-aster/core";
import { LootSystem, PowerUpSystem, DifficultyDirectorSystem, AchievementSystem, PowerUpRegistry } from "@tiny-aster/gameplay-kit";
import { StoryDirectorSystem, DialogueSystem, asteroidsStoryGraph } from "../shared/story";
import { StoryRuntime, StoryGraph } from "@tiny-aster/core";
import * as SharedVFX from "../shared/rendering/SharedVFX";
import { AsteroidsComponentRegistry, AsteroidsEventRegistry, AsteroidsBlueprintMap } from "./types/AsteroidRegistry";
import { AsteroidGameStateSystem } from "./systems/AsteroidGameStateSystem";
import { AsteroidInputSystem } from "./systems/AsteroidInputSystem";
import { AsteroidCollisionSystem } from "./systems/AsteroidCollisionSystem";
import { CombatSystem } from "@tiny-aster/gameplay-kit";
import { INITIAL_GAME_STATE } from "./types/AsteroidTypes";
import { createShip, createPowerUp, spawnAsteroidWave, registerAsteroidsBlueprints } from "./EntityFactory";
import type { IAsteroidsGame } from "./types/GameInterfaces";
import { BulletPool, ParticlePool } from "./EntityPool";
import { initializeAsteroidsRenderer } from "./rendering/AsteroidsRendererManager";
import { AsteroidConfigSchema, AsteroidConfig } from "./types/AsteroidConfigSchema";
import { GameStateComponent, InputState } from "./types/AsteroidTypes";
import { getStoryBeatForLevel } from "./story/StoryBeats";
import { registerMutatorHook } from "../../utils/MutatorRegistry";
import { resolveAndApplyMutators } from "../../config/MutatorConfig";
import { createThemeFromGameAccents } from "../../theme/gameAccents";
import asteroidsConfigRaw from "./config/asteroids.json";

const __DEV__ = process.env.NODE_ENV !== "production";

/**
 * Main game controller for Asteroids.
 * Manages the ECS world, systems, and lifecycle.
 * @public
 */
export class AsteroidsGame
  extends BaseGame<GameStateComponent, InputState, AsteroidsComponentRegistry, AsteroidsEventRegistry, AsteroidsBlueprintMap>
  implements IAsteroidsGame, INetworkGame {

  private gameStateSystem!: AsteroidGameStateSystem;
  private assetLoader!: AssetLoader;
  private bulletPool!: BulletPool;
  private particlePool!: ParticlePool;
  private network!: NetworkController<AsteroidsComponentRegistry>;
  public readonly gameId = "asteroids";
  private baseConfig: AsteroidConfig;
  private config: AsteroidConfig;
  private isHeadless: boolean;
  public mode: "deathmatch" | "story" = "deathmatch";

  public get networkManager(): NetworkManager<any> | undefined { return this.network.networkManager; }
  public set networkManager(val: NetworkManager<any> | undefined) { this.network.networkManager = val; }
  public get lastProcessedFullStateVersion(): number { return this.network.lastProcessedFullStateVersion; }
  public set lastProcessedFullStateVersion(val: number) { this.network.lastProcessedFullStateVersion = val; }
  public get isMultiplayer(): boolean { return this.network.isMultiplayer; }
  public set isMultiplayer(val: boolean) { this.network.isMultiplayer = val; }

  constructor(config: BaseGameConfig<AsteroidsComponentRegistry, AsteroidsEventRegistry, InputState> = {}) {
    if (!config.audio) {
      config.audio = new WebAudioPlayer();
    }
    if (!config.theme) {
      config.theme = createThemeFromGameAccents("asteroids");
    }
    super(config);
    this.isHeadless = config.headless !== undefined ? config.headless : (typeof window === "undefined");
    this.mode = (config.gameOptions as any)?.mode || "deathmatch";
    this.network = new NetworkController<AsteroidsComponentRegistry>(this.world);
    this.isMultiplayer = config.isMultiplayer || false;
    this.baseConfig = ConfigService.load<AsteroidConfig>(this.gameId, AsteroidConfigSchema, asteroidsConfigRaw);
    this.config = this.baseConfig;
    this.assetLoader = new AssetLoader(config.assetProvider);
  }

  protected override async onRegisterSystems(): Promise<void> {
    this.config = resolveAndApplyMutators(this.baseConfig, this._config.gameOptions);

    this.world.setResource("GameConfig", this.config);
    this.world.setResource("PowerUpEffects", new PowerUpRegistry());

    this.eventBus.on("loot:spawn", (event: any) => {
      createPowerUp({
        world: this.world,
        x: event.x,
        y: event.y,
        lootType: event.lootType
      });
    });

    this.setupCommonArcadeResources();

    if (!this.bulletPool) this.bulletPool = new BulletPool();
    if (!this.particlePool) this.particlePool = new ParticlePool();
    if (!this.assetLoader) {
      const provider = this._config.assetProvider || (typeof window !== "undefined" ? new WebAssetProvider() : undefined);
      this.assetLoader = new AssetLoader(provider);
    } else if (!this.assetLoader.hasProvider()) {
      const provider = this._config.assetProvider || (typeof window !== "undefined" ? new WebAssetProvider() : undefined);
      if (provider) {
        this.assetLoader.setProvider(provider);
      }
    }

    if (!this.isHeadless) {
        if (!this.assetLoader.hasProvider()) {
          throw new Error("AsteroidsGame initialization failed: no asset provider was configured");
        }
        await this.onPreloadAssets();
    }

    // Register blueprints using centralized helper
    registerAsteroidsBlueprints(this.world, this.blueprints);

    if (!this.networkManager) {
      this.networkManager = NetworkManager.registerGame(this.gameId, this, {
        strategy: 'full',
        interpolationDelay: 100,
        transport: this.isMultiplayer ? undefined : new NullTransport()
      });
    } else if (!this.isMultiplayer) {
      this.networkManager.setTransport(new NullTransport());
    }

    this.world.setResource("BulletPool", this.bulletPool);
    this.world.setResource("ParticlePool", this.particlePool);
    this.world.setResource("AssetLoader", this.assetLoader);

    this.gameStateSystem = new AsteroidGameStateSystem(this);

    this.world.setResource("SpatialCullingEnabled", true);

    this.world.addSystem(new SpatialCullingSystem({ margin: 100 }), { phase: SystemPhase.Simulation, priority: 100 });
    this.world.addSystem(new AsteroidInputSystem(this.config), { phase: SystemPhase.Simulation });
    this.world.addSystem(new MovementSystem(), { phase: SystemPhase.Simulation });
    this.world.addSystem(new BoundarySystem(), { phase: SystemPhase.Simulation });
    this.world.addSystem(new FrictionSystem(), { phase: SystemPhase.Simulation });
    this.world.addSystem(new CCDSystem(), { phase: SystemPhase.Simulation, priority: -10 });
    this.world.addSystem(new HierarchySystem(), { phase: SystemPhase.Transform });
    this.world.addSystem(new CollisionSystem2D(), { phase: SystemPhase.Collision });
    this.world.addSystem(new CombatSystem(), { phase: SystemPhase.Collision });
    this.world.addSystem(new AsteroidCollisionSystem(), { phase: SystemPhase.GameRules });
    this.world.addSystem(new TTLSystem(), { phase: SystemPhase.Simulation });
    this.world.addSystem(new InvulnerabilitySystem(), { phase: SystemPhase.Simulation });
    this.world.addSystem(this.gameStateSystem, { phase: SystemPhase.GameRules });

    this.world.addSystem(new SpatialPartitioningSystem(), { phase: SystemPhase.Simulation });
    this.world.addSystem(new LootSystem(), { phase: SystemPhase.GameRules });
    this.world.addSystem(new PowerUpSystem(), { phase: SystemPhase.Simulation });
    this.world.addSystem(new ComboSystem(), { phase: SystemPhase.Simulation });
    this.world.addSystem(new DifficultyDirectorSystem(), { phase: SystemPhase.GameRules });
    this.world.addSystem(new AchievementSystem(), { phase: SystemPhase.Simulation });

    if (this.mode === "story") {
      const graph = (this._config.gameOptions as { graphOverride?: StoryGraph })?.graphOverride || asteroidsStoryGraph;
      const storyRuntime = new StoryRuntime(graph);
      this.world.setResource("StoryRuntime", storyRuntime);
      this.world.addSystem(new StoryDirectorSystem(storyRuntime), { phase: SystemPhase.GameRules });
      this.world.addSystem(new DialogueSystem(), { phase: SystemPhase.Simulation });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const activeMutators = (this._config.gameOptions?.mutators as any[]) || [];
    this.world.addSystem(new MutatorSystem(activeMutators), { phase: SystemPhase.Simulation });

    if (!this.isHeadless) {
      this.world.addSystem(new ScreenShakeSystem(), { phase: SystemPhase.Presentation });
      this.world.addSystem(new FeedbackSystem(), { phase: SystemPhase.Presentation });
      this.world.addSystem(new JuiceSystem(), { phase: SystemPhase.Presentation });
      this.world.addSystem(new RenderUpdateSystem(), { phase: SystemPhase.Presentation });
      this.world.addSystem(new TrailSystem(), { phase: SystemPhase.Presentation });
      this.world.addSystem(new ParticleSystem(this.particlePool as any), { phase: SystemPhase.Presentation });
      this.world.addSystem(new AnimationSystem(), { phase: SystemPhase.Presentation });
    }

    if (this.networkManager) {
      this.world.addSystem(new LocalPredictionSystem(this.networkManager, {
        simulateFn: (world, input, dt) => {
          const localQuery = world.query("Transform", "LocalPlayer", "Velocity");
          for (const entity of localQuery) {
              const velocity  = world.getComponent(entity, "Velocity");
              const transform = world.getComponent(entity, "Transform");
              if (!velocity || !transform) continue;

              const tPlane = { rotation: transform.rotation };
              const vPlane = { vx: velocity.vx, vy: velocity.vy };

              const phys = computeShipPhysics(tPlane, vPlane, input as any, this.config, dt);

              world.mutateComponent(entity, "Velocity", (v) => {
                  v.vx = phys.vx;
                  v.vy = phys.vy;
              });
              world.mutateComponent(entity, "Transform", (t) => {
                  t.rotation = phys.rotation;
              });
          }
        }
      }), { phase: SystemPhase.Input });
      this.world.addSystem(new RemoteInterpolationSystem(this.networkManager), { phase: SystemPhase.Presentation });
    }
  }

  protected override async onInitializeEntities(): Promise<void> {
    if (this.isMultiplayer) return;

    // Temporarily unlock gameplayRandom for spawning initialization
    this.world.gameplayRandom.unlock();

    try {
        // Create GameState entity
        const gameStateEntity = this.world.createEntity();
        const beat = this.mode === "story" ? getStoryBeatForLevel(1) : null;
        this.world.addComponent(gameStateEntity, {
            type: "GameState",
            score: 0,
            level: 1,
            lives: 3,
            isGameOver: false,
            mode: this.mode,
            readyRemaining: this.mode === "story" ? 3.0 : 0,
            intermissionRemaining: 0,
            storyBeatText: beat ? beat.readyText : undefined
        } as GameStateComponent);

        // Create Player Ship
        const screen = this.world.getResource<{ width: number; height: number }>("ScreenConfig") || { width: 800, height: 600 };
        const ship = createShip({
            world: this.world,
            x: screen.width / 2,
            y: screen.height / 2
        });

        // Add LocalPlayer and Input components to the ship
        this.world.addComponent(ship, { type: "LocalPlayer" });
        this.world.addComponent(ship, {
            type: "Input",
            actions: {},
            axes: {}
        });

        // Note: The "Combo" component is already successfully instantiated and attached
        // to the ship entity via the "ship" blueprint in registerAsteroidsBlueprints (EntityFactory.ts).
        // This ensures the ComboSystem has a target to process and update during gameplay.

        // Spawn first wave
        spawnAsteroidWave(this.world, 1);
    } finally {
        this.world.gameplayRandom.lock();
    }
  }

  public update(dt: number): void {
      this.world.update(dt);
  }


  /**
   * Preloads game assets (SFX and Textures) to prevent cold-start latency.
   *
   * @warning
   * Asset loading may fail due to network or filesystem issues. Failure to
   * preload assets may result in visual or audio artifacts during gameplay.
   */
  private async onPreloadAssets(): Promise<void> {
    const loader = this.assetLoader;
    try {
      if (loader) {
        await loader.load([
          { id: "ship_sprite", type: "image", path: require("../../../assets/ship.png") }
        ]);
      }
    } catch (e) {
      console.error("[Asset] Failed to load asset ship_sprite:", e);
    }
  }

  public setMultiplayerMode(active: boolean) {
    this.network.setMultiplayerMode(active);
  }

  /**
   * Applies an input frame to a specific player ship entity.
   */
  public applyInputToEntity(entityId: number, input: InputFrame) {
    this.network.applyInputToEntity(entityId, input);
  }


  /**
   * Performs local player movement prediction using the shared simulation.
   */
  public predictLocalPlayer(input: InputFrame, deltaTime: number) {
    this.network.predictLocalPlayer(input, deltaTime);
  }

  /**
   * Runs a single simulation step.
   */
  public runSimulationStep(deltaTime: number, isResimulating: boolean) {
    this.network.runSimulationStep(deltaTime, isResimulating);
  }

  public updateFromServer(payload: ServerUpdatePayload, localSessionId?: string) {
    this.network.updateFromServer(payload, localSessionId);
  }

  /**
   * Registers game-specific rendering logic to the provided renderer.
   */
  public initializeRenderer(renderer: Renderer<AsteroidsComponentRegistry, any>): void {
    if (this.isHeadless) return;
    initializeAsteroidsRenderer(renderer);
    SharedVFX.registerSharedVFX(renderer);
  }

  public getGameState(): GameStateComponent {
    const state = this.world.getSingleton("GameState");
    if (!state) return INITIAL_GAME_STATE;

    let combo = 0;
    let multiplier = 1;
    let comboTimerRemaining = 0;

    const comboEntities = this.world.query("Combo");
    const comboEntity = comboEntities[0];
    if (comboEntity !== undefined) {
      const comboComp = this.world.getComponent(comboEntity, "Combo");
      if (comboComp) {
        combo = comboComp.combo;
        multiplier = comboComp.multiplier;
        comboTimerRemaining = Math.max(0, comboComp.timerRemaining);
      }
    }

    let isDialogueActive = false;
    let dialogueText = "";
    const dialogueBoxEntities = this.world.query("DialogueBox");
    if (dialogueBoxEntities.length > 0) {
      // TODO(refactor): código duplicado detectado (bloque) con space-invaders/SpaceInvadersGame.ts:677-689. Considerar extraer a función compartida. Ref: 4fe85665
      const dialogueBox = this.world.getComponent(dialogueBoxEntities[0], "DialogueBox");
      if (dialogueBox) {
        isDialogueActive = true;
        const currentLineKey = dialogueBox.lines[dialogueBox.currentLineIndex];
        dialogueText = currentLineKey || "";
      }
    }

    return {
      ...state,
      combo,
      multiplier,
      comboTimerRemaining,
      isDialogueActive,
      dialogueText
    } as any;
  }

  public isGameOver(): boolean {
    return this.gameStateSystem.isGameOver();
  }

  /**
   * Decoupled Input Bridge: Sets the state of the local player inputs in the ECS World.
   * Mapped fields: rotateLeft, rotateRight, thrust, shoot, hyperspace, rotationAmount.
   * Ensures that the LocalPlayer entity has the "Input" component, adding it if missing.
   */
  public setInputState(input: any): void {
    // Paso 1: Unificar el puente de Inputs
    const localPlayer = this.world.query("LocalPlayer")[0];
    if (localPlayer !== undefined) {
      if (!this.world.hasComponent(localPlayer, "Input")) {
        // Verify that the LocalPlayer entity has the "Input" component, adding it if missing with all flags false and rotationAmount 0.
        this.world.addComponent(localPlayer, {
          type: "Input",
          actions: {},
          axes: {}
        });
      }
      this.world.mutateComponent(localPlayer, "Input", (inputComp: any) => {
        if (!inputComp.actions || typeof inputComp.actions !== "object" || inputComp.actions instanceof Set) {
          inputComp.actions = {};
        }
        if (!inputComp.axes) inputComp.axes = {};

        if (input && typeof input === "object" && input.axes) {
          const moveX = input.axes.moveX ?? 0;
          const moveY = input.axes.moveY ?? 0;
          const actions = input.actions;
          const hasAction = (name: string) => actions instanceof Set ? actions.has(name) : !!actions?.includes?.(name);

          inputComp.actions["rotateLeft"] = moveX < 0;
          inputComp.actions["rotateRight"] = moveX > 0;
          inputComp.actions["thrust"] = moveY < 0 || hasAction("boost");
          inputComp.actions["shoot"] = hasAction("fire");
          inputComp.actions["hyperspace"] = hasAction("hyperspace");
        } else {
          // Only write fields that are defined in the payload (!== undefined)
          if (input.rotateLeft !== undefined) {
            inputComp.actions["rotateLeft"] = input.rotateLeft;
          }
          if (input.rotateRight !== undefined) {
            inputComp.actions["rotateRight"] = input.rotateRight;
          }
          if (input.thrust !== undefined) {
            inputComp.actions["thrust"] = input.thrust;
          }
          if (input.shoot !== undefined) {
            inputComp.actions["shoot"] = input.shoot;
          }
          if (input.hyperspace !== undefined) {
            inputComp.actions["hyperspace"] = input.hyperspace;
          }
          if (input.rotationAmount !== undefined) {
            inputComp.axes["rotate_x"] = input.rotationAmount;
            inputComp.axes["horizontal"] = input.rotationAmount;
          }
        }
      });
    }
  }

  public override start(): void {
    super.start();
    if (__DEV__) console.log("[AsteroidsGame] Simulation started");
  }

  public override destroy(): void {
    super.destroy();
    this.bulletPool?.clear();
    this.particlePool?.clear();
  }

  public override pause(): void {
    super.pause();
    if (__DEV__) console.log("[AsteroidsGame] Simulation paused");
  }

  public override resume(): void {
    super.resume();
    if (__DEV__) console.log("[AsteroidsGame] Simulation resumed");
  }

}

/** @public */
export class NullAsteroidsGame extends NullBaseGame<GameStateComponent, InputState, AsteroidsComponentRegistry, AsteroidsEventRegistry> implements IAsteroidsGame {
  public override getGameState(): GameStateComponent {
    return INITIAL_GAME_STATE;
  }
}

export { AsteroidsDefinition } from "./AsteroidsDefinition";

registerMutatorHook("story_fragment", (world: World) => {
  const eventBus = world.getEventBus();
  if (eventBus) {
    eventBus.emit("story:beat_reached", { beatId: "asteroids_story_beat", dialogueReference: "story.chapter_1_fragment_1" });
  }
});
