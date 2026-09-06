import { World, ComponentRegistry, BlueprintRegistryMap } from "../ecs/World";
import { ComponentType } from "../ecs/Component";
import { Entity } from "../ecs/Entity";
import { EventRegistry, EventBus } from "../events/EventBus";
import { BlueprintRegistry } from "../ecs/BlueprintRegistry";
import { IGame } from "./IGame";
import { GameLoop } from "../loop/GameLoop";
import { Simulation } from "./Simulation";
import { CompactInputFrame } from "../input/InputFrame";
import { WorldSnapshot, SoAWorldSnapshot, AoSWorldSnapshot } from "../snapshots/WorldSnapshot";
import { hashSoA, hashAoS } from "../snapshots/SnapshotHash";
import { IInputSystem } from "../input/InputSystem";
import { NullInputSystem } from "../input/NullInputSystem";
import { Schedule } from "../ecs/Schedule";
import { SceneManager } from "../scenes/SceneManager";
import { IAudioPlayer, NullAudioPlayer } from "../audio/IAudioPlayer";
import { IAssetProvider } from "../assets/AssetLoader";
import { ArcadeKernel, ArcadeState } from "./ArcadeKernel";
import { Theme } from "../theme/Theme";
import { createDeferredEntity } from "../ecs/EntityHelpers";
import {
  enterGameplayFreeze,
  exitGameplayFreeze,
  isGameplayFrozen,
  getGameplayFreezeRemaining
} from "./GameplayFreezeMixin";

/**
 * Enumeration of lifecycle execution states for a `BaseGame` instance.
 * @public
 */
export enum GameLifecycleState {
  /** Uninitialized game instance before `init()` execution. */
  UNINITIALIZED = "UNINITIALIZED",
  /** Initialization completed and ready to run. */
  READY = "READY",
  /** Active running state with game loop ticker running. */
  RUNNING = "RUNNING",
  /** Paused state with game loop paused. */
  PAUSED = "PAUSED",
  /** Game loop stopped. */
  STOPPED = "STOPPED",
  /** All systems destroyed and event handlers cleared. */
  DESTROYED = "DESTROYED",
  /** Initialization timed out or threw an unhandled error. */
  ERROR = "ERROR"
}

interface TimedSystem {
  constructor: { name?: string };
  lastExecutionTimeMs?: number;
}

interface DebugCollider2D {
  enabled?: boolean;
  isTrigger?: boolean;
  shape?: { type?: string };
}

interface DebugTransform {
  x: number;
  y: number;
}

/**
 * Configuration options for initializing a `BaseGame` instance.
 *
 * @typeParam TComponents - Component registry type.
 * @typeParam TEvents - Event registry type.
 * @typeParam TInput - Input action dictionary type.
 * @typeParam TBlueprints - Blueprint registry map type.
 *
 * @public
 */
export interface BaseGameConfig<
  TComponents extends ComponentRegistry = ComponentRegistry,
  TEvents extends EventRegistry = EventRegistry,
  TInput extends Record<string, any> = Record<string, any>,
  TBlueprints extends BlueprintRegistryMap<TComponents> = BlueprintRegistryMap<TComponents>
> {
  /** Key code to toggle pause state (e.g. `"KeyP"`). */
  pauseKey?: string;
  /** Key code to trigger restart (e.g. `"KeyR"`). */
  restartKey?: string;
  /** Enables multiplayer-specific synchronization logic and manual ticking. */
  isMultiplayer?: boolean;
  /** Global game options map, including optional initial random seed. */
  gameOptions?: Record<string, unknown>;
  /** Runs the game headlessly without loading visual/audio assets. Ideal for server-side environments. */
  headless?: boolean;
  /** Optional custom `Schedule` instance for execution phase ordering. */
  schedule?: Schedule<TComponents, TEvents, TBlueprints>;
  /** Initial gameplay seed (for backward compatibility). */
  seed?: number;
  /** Optional audio player injection implementing `IAudioPlayer`. Defaults to `NullAudioPlayer`. */
  audio?: IAudioPlayer;
  /** Optional asset provider injection implementing `IAssetProvider`. */
  assetProvider?: IAssetProvider;
  /** Timeout for `init()` execution in milliseconds. Defaults to 10000ms. */
  initTimeout?: number;
  /** Optional custom input system instance implementing `IInputSystem<TInput>`. Defaults to `NullInputSystem`. */
  inputSystem?: IInputSystem<TInput>;
  /** Factory callback to construct a custom `SceneManager` instance. */
  sceneManagerFactory?: (world: World<TComponents, TEvents, TBlueprints>, eventBus: EventBus<TEvents>) => SceneManager<TComponents>;
  /** Optional `ArcadeKernel` state machine instance. Defaults to a new `ArcadeKernel`. */
  arcadeKernel?: ArcadeKernel;
  /** Disables the automatic loop ticker when true, delegating frame updates to an external driver (such as `GameSession`). */
  manualLoop?: boolean;
  /** Optional theme configuration for decoupling sprite asset keys, color palettes, and lore texts. */
  theme?: Theme;
  /** Optional HTML Canvas Element target for rendering and viewport dimensions. */
  canvas?: HTMLCanvasElement;
}

/**
 * Abstract base class for all game implementations built on the TinyAster ECS engine.
 *
 * @remarks
 * `BaseGame` provides a template-method lifecycle (`init`, `start`, `pause`, `resume`, `restart`, `destroy`),
 * manages central resources (`World`, `EventBus`, `SceneManager`, `ArcadeKernel`, `IAudioPlayer`), and implements
 * snapshot hash calculation and step execution required by `Simulation` and `IGame`.
 *
 * @typeParam TState - The representation of the game state.
 * @typeParam TInput - The representation of the input dictionary.
 * @typeParam TComponents - The registry of components available in this game.
 * @typeParam TEvents - The registry of events that can be emitted.
 * @typeParam TBlueprints - The registry of blueprints that can be spawned.
 *
 * @public
 */
export abstract class BaseGame<
  TState = unknown,
  TInput extends Record<string, any> = Record<string, any>,
  TComponents extends ComponentRegistry = ComponentRegistry,
  TEvents extends EventRegistry = EventRegistry,
  TBlueprints extends BlueprintRegistryMap<TComponents> = BlueprintRegistryMap<TComponents>
> implements IGame<TState, TInput, TComponents, TEvents, TBlueprints>, Simulation {
  /** Current simulation tick from the underlying ECS `World`. */
  public get tick(): number {
    return this.world.tick;
  }

  /** High-level game state representation. */
  public get state(): TState {
    return this.getGameState();
  }

  /**
   * Advances the game simulation by exactly one step (1/60th second) with the given input frame.
   *
   * @param input - Compact input frame containing tick number and action bitmasks.
   */
  public step(input: CompactInputFrame): void {
    this.onApplyInputFrame(input);
    this.world.update(1 / 60);
  }

  /**
   * Internal hook for decoding compact input bitmasks into input system actions.
   *
   * @param input - Compact input frame to process.
   */
  protected onApplyInputFrame(input: CompactInputFrame): void {
    // Fallback/Default implementation. Subclasses can override to decode bitmasks.
  }

  /**
   * Captures a serializable `WorldSnapshot` of the current ECS state.
   *
   * @returns `WorldSnapshot` instance.
   */
  public snapshot(): WorldSnapshot {
    return this.world.snapshot();
  }

  /**
   * Restores the game simulation state from a `WorldSnapshot`.
   *
   * @param snapshot - The snapshot to restore.
   */
  public restore(snapshot: WorldSnapshot): void {
    this.world.restore(snapshot);
  }

  /**
   * Computes a deterministic hexadecimal FNV-1a hash of the current simulation state.
   *
   * @remarks
   * For Structure of Arrays (`SoAWorldSnapshot`) snapshots, delegates to zero-allocation binary buffer hashing via `hashSoA`
   * to eliminate intermediate string conversions and heap allocations during high-frequency rollback checks.
   * For legacy Array of Structures snapshots (`isSoA === false`), falls back to JSON stringification.
   *
   * @returns 8-character hex hash string.
   */
  public hash(): string {
    const snap = this.snapshot();
    if (snap.isSoA) {
      return hashSoA(snap as SoAWorldSnapshot);
    }

    const aosSnap = snap as AoSWorldSnapshot;
    return hashAoS({
      tick: aosSnap.tick,
      entities: aosSnap.entities,
      componentData: aosSnap.componentData,
      seed: aosSnap.seed,
      rngState: aosSnap.rngState
    });
  }

  /** The primary ECS `World` container. */
  public world: World<TComponents, TEvents, TBlueprints>;
  /** Central `EventBus` for typed event dispatching. */
  public eventBus: EventBus<TEvents>;
  /** Blueprint registry for entity creation and prefab spawning. */
  public blueprints: BlueprintRegistry<
    TComponents,
    TEvents,
    [TBlueprints] extends [BlueprintRegistryMap<TComponents, TEvents>] ? TBlueprints : BlueprintRegistryMap<TComponents, TEvents>
  >;
  protected loop: GameLoop;
  protected unifiedInput: IInputSystem<TInput>;
  protected _config: BaseGameConfig<TComponents, TEvents, TInput, TBlueprints>;
  private lifecycleState: GameLifecycleState = GameLifecycleState.UNINITIALIZED;
  private isPaused = false;
  /** High-level state machine kernel for flow and session transition management. */
  public readonly kernel: ArcadeKernel;
  private boundStateChangedListener?: () => void;
  private boundGameOverListener?: () => void;

  /** Scene manager for data-driven scene lifecycle and narrative transitions. */
  public sceneManager: SceneManager<TComponents>;
  /** Platform-agnostic audio player instance. */
  public audio: IAudioPlayer;
  /** Target HTML canvas element when running in browser environment. */
  protected canvas?: HTMLCanvasElement;
  private resizeListenerBound?: () => void;
  private _debugEventLog: Array<{ timestamp: number; event: string; payload: unknown }> = [];

  /**
   * Diagnostics and debug manager interface consumed by developer overlays.
   */
  public get debugManager() {
    return {
      getFrameStats: () => {
        return {
          fps: 60,
          frameTime: 16.67,
          tick: this.world.tick,
          alpha: 1.0
        };
      },
      getSystemTimings: (): Record<string, number> => {
        const timings: Record<string, number> = {};
        const systems = this.world.schedule.getSystems();
        for (let i = 0; i < systems.length; i++) {
          const sys = systems[i] as TimedSystem;
          const name = sys.constructor.name || `System_${i}`;
          timings[name] = sys.lastExecutionTimeMs ?? 0.01;
        }
        return timings;
      },
      getEntitySnapshot: () => {
        const allEntities = this.world.getAllEntities();
        const snapshot: Array<{ id: number; components: Record<string, unknown> }> = [];
        for (let i = 0; i < allEntities.length; i++) {
          const entity = allEntities[i];
          if (!this.world.isAlive(entity)) continue;
          const types = this.world.getEntityComponentTypes(entity);
          const components: Record<string, unknown> = {};
          for (let j = 0; j < types.length; j++) {
            const t = types[j] as Extract<keyof TComponents, string>;
            components[t] = this.world.getComponent(entity, t);
          }
          snapshot.push({ id: entity, components });
        }
        return snapshot;
      },
      getEventLog: () => {
        return this._debugEventLog;
      },
      getColliderShapes: () => {
        const shapes: Array<{ type: "circle" | "aabb"; x: number; y: number; isTrigger: boolean; shape: unknown }> = [];
        const colKey = "Collider2D" as Extract<keyof TComponents, string>;
        const transKey = "Transform" as Extract<keyof TComponents, string>;
        const entitiesWithCollider = this.world.query(colKey, transKey);
        for (let i = 0; i < entitiesWithCollider.length; i++) {
          const e = entitiesWithCollider[i];
          const col = this.world.getComponent(e, colKey) as DebugCollider2D | undefined;
          const trans = this.world.getComponent(e, transKey) as DebugTransform | undefined;
          if (col && trans && col.enabled !== false) {
            if (col.shape?.type === "circle" || col.shape?.type === "aabb") {
              shapes.push({
                type: col.shape.type as "circle" | "aabb",
                x: trans.x,
                y: trans.y,
                isTrigger: !!col.isTrigger,
                shape: col.shape
              });
            }
          }
        }
        return shapes;
      },
      clearEventLog: () => {
        this._debugEventLog = [];
      }
    };
  }

  /**
   * Constructs a `BaseGame` instance.
   *
   * @param config - Game configuration options.
   */
  constructor(config: BaseGameConfig<TComponents, TEvents, TInput, TBlueprints> = {}) {
    this._config = config;
    this.world = new World<TComponents, TEvents, TBlueprints>(config.schedule);
    this.eventBus = new EventBus<TEvents>();
    this.kernel = config.arcadeKernel ?? new ArcadeKernel(this.eventBus);
    this.blueprints = new BlueprintRegistry<
      TComponents,
      TEvents,
      [TBlueprints] extends [BlueprintRegistryMap<TComponents, TEvents>] ? TBlueprints : BlueprintRegistryMap<TComponents, TEvents>
    >();
    this.loop = new GameLoop({
      step: 1 / 60,
      maxDelta: 0.25,
      manual: config.isMultiplayer || config.manualLoop || false
    });
    this.unifiedInput = config.inputSystem || new NullInputSystem<TInput>();
    this.sceneManager = config.sceneManagerFactory
      ? config.sceneManagerFactory(this.world, this.eventBus)
      : new SceneManager<TComponents>(this.world, this.eventBus);
    this.audio = config.audio || new NullAudioPlayer();

    // Set the initial gameplay random seed from config/options
    const initialSeed = (config.gameOptions?.seed as number) ?? config.seed ?? Math.floor(Math.random() * 0xFFFFFFFF);
    this.world.gameplayRandom.unlock();
    this.world.gameplayRandom.setSeed(initialSeed);
    this.world.gameplayRandom.lock();

    const originalEmit = this.eventBus.emit.bind(this.eventBus);
    this.eventBus.emit = (event: string, payload?: unknown) => {
      this._debugEventLog.push({
        timestamp: performance.now(),
        event: String(event),
        payload
      });
      if (this._debugEventLog.length > 100) {
        this._debugEventLog.shift();
      }
      return originalEmit(event as Parameters<typeof originalEmit>[0], payload as Parameters<typeof originalEmit>[1]);
    };

    this.eventBus.on("PlaySFX", (payload) => {
      if (payload && (payload as { name?: string }).name) {
        // Automatically route global PlaySFX EventBus events to the configured audio player
        this.audio.playSFX((payload as { name: string }).name);
      }
    });

    this.registerInternalResources();
    this.registerEventBusListeners();

    // Subscribe loop to update (runs during RUNNING or PAUSED for presentation/UI rendering)
    this.loop.subscribeUpdate((dt) => {
      if (this.lifecycleState === GameLifecycleState.RUNNING || this.lifecycleState === GameLifecycleState.PAUSED) {
        this.update(dt);
      }
    });
  }

  private registerInternalResources(): void {
    // Register the blueprint registry as a world resource for the command buffer
    this.world.setResource("BlueprintRegistry", this.blueprints);
    this.world.setResource("EventBus", this.eventBus);
    this.world.setResource("InputSystem", this.unifiedInput);
    this.world.setResource("Audio", this.audio);
    this.world.setResource("SceneManager", this.sceneManager);
    this.world.setResource("headless", this._config.headless);
    this.world.setResource("ArcadeKernel", this.kernel);
    this.world.setResource("Theme", this._config.theme ?? { spriteMap: {}, colorMap: {} });
  }

  private registerEventBusListeners(): void {
    // Unsubscribe existing listeners if they exist to prevent duplicates
    if (this.boundStateChangedListener) {
      this.boundStateChangedListener();
      this.boundStateChangedListener = undefined;
    }
    if (this.boundGameOverListener) {
      this.boundGameOverListener();
      this.boundGameOverListener = undefined;
    }

    // Subscribe and store unsubscribe functions
    this.boundStateChangedListener = this.eventBus.on("arcade:state_changed", (data) => {
      const stateData = data as { to?: ArcadeState };
      if (stateData.to === ArcadeState.PAUSED && !this.isPaused) {
        this.pause();
      } else if (stateData.to === ArcadeState.PLAYING && this.isPaused) {
        this.resume();
      }
    });

    // Subscribe to game over events to transition the kernel
    this.boundGameOverListener = this.eventBus.on("game:over", (payload) => {
      if (this.kernel.getState() === ArcadeState.PLAYING) {
        const score = (payload as { state?: { score?: number } } | undefined)?.state?.score;
        this.kernel.transitionTo(ArcadeState.GAME_OVER, { score });
      }
    });
  }

  /**
   * Returns the primary ECS `World` container instance.
   *
   * @returns The `World` instance.
   */
  getWorld(): World<TComponents, TEvents, TBlueprints> {
    return this.world;
  }

  /**
   * Returns the `EventBus` instance used for typed event emissions.
   *
   * @returns The `EventBus` instance.
   */
  getEventBus(): EventBus<TEvents> {
    return this.eventBus;
  }

  /**
   * Returns the `IInputSystem` instance managing local player input state.
   *
   * @returns The input system instance.
   */
  getInputSystem(): IInputSystem<TInput> {
    return this.unifiedInput;
  }

  /**
   * Returns the underlying `GameLoop` instance.
   *
   * @returns The `GameLoop` instance.
   */
  public getGameLoop(): GameLoop {
    return this.loop;
  }

  /**
   * Returns the last error caught by the game loop ticker, or `null` if none occurred.
   *
   * @returns The last `Error` or `null`.
   */
  public getLastError(): Error | null {
    return this.loop.getLastError();
  }

  /**
   * Subscribes a listener to unhandled exceptions encountered during game loop execution.
   *
   * @param callback - Function invoked when an exception occurs.
   * @returns Unsubscribe function.
   */
  public subscribeError(callback: (err: Error) => void): () => void {
    return this.loop.subscribeError(callback);
  }

  /**
   * Asynchronously initializes the game instance using the Template Method pattern.
   *
   * @remarks
   * Sequence of execution:
   * 1. Invokes `onRegisterSystems()` hook to populate system schedules.
   * 2. Invokes `onInitializeEntities()` hook to populate initial entities and scenes.
   * 3. Transitions lifecycle state to `READY` and triggers `start()`.
   *
   * If execution exceeds `initTimeout`, the operation rejects and sets lifecycle state to `ERROR`.
   * If destroyed during initialization, startup sequence aborts gracefully.
   *
   * @throws Error - If initialization times out or an unhandled exception occurs in hooks.
   */
  public async init(): Promise<void> {
    if (this.lifecycleState !== GameLifecycleState.UNINITIALIZED) {
      return;
    }

    const timeoutMs = this._config.initTimeout ?? 10000;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error("Game initialization timed out"));
      }, timeoutMs);
    });

    const initPromise = (async () => {
      await this.onRegisterSystems();
      if ((this.lifecycleState as GameLifecycleState) === GameLifecycleState.DESTROYED) {
        return;
      }
      await this.onInitializeEntities();
      if ((this.lifecycleState as GameLifecycleState) === GameLifecycleState.DESTROYED) {
        return;
      }
    })();

    try {
      await Promise.race([initPromise, timeoutPromise]);
      if ((this.lifecycleState as GameLifecycleState) !== GameLifecycleState.DESTROYED) {
        this.lifecycleState = GameLifecycleState.READY;
        this.start();
      }
    } catch (error) {
      if ((this.lifecycleState as GameLifecycleState) !== GameLifecycleState.DESTROYED) {
        this.lifecycleState = GameLifecycleState.ERROR;
      }
      throw error;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  /**
   * Starts game loop execution if in `READY` or `STOPPED` state.
   */
  public start(): void {
    if (
      this.lifecycleState !== GameLifecycleState.READY &&
      this.lifecycleState !== GameLifecycleState.STOPPED
    ) {
      return;
    }
    this.lifecycleState = GameLifecycleState.RUNNING;
    this.loop.start();
  }

  /**
   * Idempotently pauses game loop execution and sets the `IsPaused` world resource to `true`.
   *
   * @remarks
   * Prevents duplicate ticker pauses or delta accumulator desynchronization.
   * Synchronizes `kernel` state to `ArcadeState.PAUSED` if currently in `ArcadeState.PLAYING`.
   */
  public pause(): void {
    if (this.isPaused) return;
    this.isPaused = true;
    this.lifecycleState = GameLifecycleState.PAUSED;
    this.world.setResource("IsPaused", true);

    if (this.kernel.getState() === ArcadeState.PLAYING) {
      this.kernel.transitionTo(ArcadeState.PAUSED);
    }
  }

  /**
   * Idempotently resumes game loop execution if currently paused and clears the `IsPaused` world resource.
   *
   * @remarks
   * Mitigates extreme delta time spikes upon resuming physical simulation ticks.
   * Synchronizes `kernel` state to `ArcadeState.PLAYING` if currently in `ArcadeState.PAUSED`.
   */
  public resume(): void {
    if (!this.isPaused) return;
    this.isPaused = false;
    this.lifecycleState = GameLifecycleState.RUNNING;
    this.world.deleteResource("IsPaused");

    if (this.kernel.getState() === ArcadeState.PAUSED) {
      this.kernel.transitionTo(ArcadeState.PLAYING);
    }
  }

  /**
   * Returns whether the game loop is currently in a paused state.
   *
   * @returns `true` if paused, `false` otherwise.
   */
  public isPausedState(): boolean {
    return this.isPaused;
  }

  /**
   * Enters soft pause / gameplay freeze state, setting the `GameplayFreeze` world resource.
   *
   * @param duration - Optional freeze duration in seconds. If omitted, freeze persists until manually exited.
   */
  public enterGameplayFreeze(duration?: number): void {
    enterGameplayFreeze(this.world as unknown as World, duration);
  }

  /**
   * Exits soft pause / gameplay freeze state, deleting the `GameplayFreeze` world resource.
   */
  public exitGameplayFreeze(): void {
    exitGameplayFreeze(this.world as unknown as World);
  }

  /**
   * Returns whether gameplay simulation is currently frozen.
   *
   * @returns `true` if frozen, `false` otherwise.
   */
  public isGameplayFrozen(): boolean {
    return isGameplayFrozen(this.world as unknown as World);
  }

  /**
   * Returns remaining gameplay freeze duration in seconds, or `undefined` if not frozen or infinite.
   *
   * @returns Remaining freeze duration in seconds or `undefined`.
   */
  public getGameplayFreezeRemaining(): number | undefined {
    return getGameplayFreezeRemaining(this.world as unknown as World);
  }

  /**
   * Returns the current `GameLifecycleState` of the game instance.
   *
   * @returns Current lifecycle state enum value.
   */
  public getLifecycleState(): GameLifecycleState {
    return this.lifecycleState;
  }

  /**
   * Stops game loop ticker execution and sets lifecycle state to `STOPPED`.
   */
  public stop(): void {
    if (this.lifecycleState !== GameLifecycleState.RUNNING && this.lifecycleState !== GameLifecycleState.PAUSED) return;
    this.lifecycleState = GameLifecycleState.STOPPED;
    this.loop.stop();
  }

  /**
   * Stops the game loop ticker and thoroughly releases registered systems, schedules, and event bus handlers.
   *
   * @remarks
   * Postcondition: Lifecycle state becomes `DESTROYED`. System dispose callbacks are executed, schedule is cleared,
   * and input system resources are released.
   */
  /**
   * Calculates current screen configuration based on canvas dimensions, window inner size, or default fallback (800x600).
   *
   * @returns `ScreenConfig` object `{ width, height, pixelRatio }`.
   */
  protected calculateScreenConfig(): { width: number; height: number; pixelRatio: number } {
    let width = 800;
    let height = 600;
    let pixelRatio = 1;

    if (this.canvas) {
      width = this.canvas.clientWidth || this.canvas.width || width;
      height = this.canvas.clientHeight || this.canvas.height || height;
    } else if (typeof window !== "undefined") {
      width = window.innerWidth || width;
      height = window.innerHeight || height;
      pixelRatio = window.devicePixelRatio || 1;
    }

    return { width, height, pixelRatio };
  }

  /**
   * Recalculates screen config and updates the `"ScreenConfig"` resource in the world.
   */
  protected handleScreenResize(): void {
    const config = this.calculateScreenConfig();
    this.world.setResource("ScreenConfig", config);
  }

  /**
   * Attaches a window resize event listener that delegates to `handleScreenResize()`.
   */
  protected registerResizeListener(): void {
    if (typeof window === "undefined") return;
    this.unregisterResizeListener();
    this.resizeListenerBound = () => this.handleScreenResize();
    window.addEventListener("resize", this.resizeListenerBound);
  }

  /**
   * Removes the window resize event listener if previously registered.
   */
  protected unregisterResizeListener(): void {
    if (typeof window !== "undefined" && this.resizeListenerBound) {
      window.removeEventListener("resize", this.resizeListenerBound);
      this.resizeListenerBound = undefined;
    }
  }

  /**
   * Common setup helper for arcade minigames. Sets screen config, registers resize listener, and saves canvas reference.
   *
   * @param canvas - Optional HTML canvas element.
   */
  protected setupCommonArcadeResources(canvas?: HTMLCanvasElement): void {
    if (canvas) {
      this.canvas = canvas;
    } else if (this._config.canvas) {
      this.canvas = this._config.canvas;
    }
    this.handleScreenResize();
    this.registerResizeListener();
  }

  /**
   * Applies server state update payload to world entities and immediately flushes queued command buffer mutations.
   *
   * @remarks
   * Critical for network netcode: flushing command buffer out-of-band ensures new network entities are fully materialized prior to next frame tick or rendering query.
   *
   * @param update - Server state payload containing entities or resources.
   */
  public applyServerStateUpdate(update: WorldSnapshot | { resources?: Record<string, unknown> }): void {
    if ("tick" in update && "entities" in update) {
      this.world.restore(update as WorldSnapshot);
    }
    if ("resources" in update && update.resources && typeof update.resources === "object" && update.resources !== null) {
      Object.entries(update.resources as Record<string, unknown>).forEach(([key, val]) => {
        this.world.setResource(key, val);
      });
    }
    this.world.flush();
  }

  public destroy(): void {
    this.lifecycleState = GameLifecycleState.DESTROYED;
    this.loop.stop();

    this.unregisterResizeListener();
    this.world.schedule.clearSystems();
    this.eventBus.clear();

    if (typeof this.unifiedInput?.dispose === "function") {
      this.unifiedInput.dispose();
    }
  }

  /**
   * Asynchronously restarts the entire game session by tearing down the current world and re-executing `init()`.
   *
   * @remarks
   * Sequence:
   * 1. Invokes `onBeforeRestart()` lifecycle hook.
   * 2. Calls `destroy()` and clears the `EventBus` to prevent duplicate handler accumulations.
   * 3. Instantiates a fresh `World` and `SceneManager`.
   * 4. Re-executes `init()` to re-register systems and initialize initial entities.
   *
   * @param seed - Optional random seed override for the new simulation instance.
   */
  public async restart(seed?: number): Promise<void> {
    if (seed !== undefined) {
      this._config.gameOptions = { ...this._config.gameOptions, seed };
    }

    await this.onBeforeRestart();
    if (this.lifecycleState === GameLifecycleState.DESTROYED) {
      return;
    }
    this.destroy();
    this.eventBus.clear();

    this.lifecycleState = GameLifecycleState.UNINITIALIZED;
    this.isPaused = false;

    // Reset world and re-register resources
    this.world = new World<TComponents, TEvents, TBlueprints>(this._config.schedule);
    this.sceneManager = this._config.sceneManagerFactory
      ? this._config.sceneManagerFactory(this.world, this.eventBus)
      : new SceneManager<TComponents>(this.world, this.eventBus);
    this.registerInternalResources();
    this.registerEventBusListeners();

    // Re-register systems and initialize entities by running init()
    await this.init();
  }

  /**
   * Subscribes a listener function to receive state updates on render ticks.
   *
   * @param cb - Callback function receiving current game state.
   * @returns Unsubscribe function.
   */
  public subscribe(cb: (state: TState) => void): () => void {
    return this.loop.subscribeRender(() => {
      cb(this.getGameState());
    });
  }

  /**
   * Updates game systems for a single tick duration `dt`. Subclasses must implement gameplay logic here.
   *
   * @param dt - Delta time in seconds.
   */
  public abstract update(dt: number): void;

  /**
   * Template method hook for subclasses to register ECS systems. Executed during `init()`.
   */
  protected async onRegisterSystems(): Promise<void> {
    // Overridden by subclasses to register systems
  }

  /**
   * Template method hook for subclasses to initialize initial entities and scenes. Executed during `init()`.
   */
  protected async onInitializeEntities(): Promise<void> {
    // Overridden by subclasses to initialize entities
  }

  /**
   * Template method hook for subclasses to execute teardown or persistence logic prior to restarting.
   * Executed at the beginning of `restart()`.
   */
  protected async onBeforeRestart(): Promise<void> {
    // Overridden by subclasses if needed
  }

  /**
   * Returns a representation of the current game state payload.
   */
  public abstract getGameState(): TState;

  /**
   * Returns the random seed used to initialize the game world simulation.
   */
  public getSeed(): number {
    return (this._config.gameOptions?.seed as number) ?? 0;
  }

  /**
   * Returns whether the game has reached a terminal game-over state.
   */
  public abstract isGameOver(): boolean;

  /**
   * Decoupled input bridge to set local action overrides in the unified input system.
   *
   * @param input - Partial map of action names to boolean pressed states.
   */
  public setInputState(input: Partial<TInput>): void {
    if (this.unifiedInput) {
      Object.entries(input).forEach(([action, pressed]) => {
        this.unifiedInput.setOverride(action as keyof TInput & string, !!pressed);
      });
    }
  }

  /**
   * Helper to instantiate a new entity and return an attachment function for components,
   * automatically using deferred command buffer allocation if called during system update ticks.
   *
   * @param deferred - Force deferred creation via command buffer.
   * @returns Object containing reserved `entity` ID and `add` helper function.
   */
  protected createBaseEntity(deferred?: boolean): { entity: Entity; add: <K extends ComponentType<TComponents>>(comp: TComponents[K] & { type: K }) => void } {
    return createDeferredEntity(this.world, deferred);
  }
}
