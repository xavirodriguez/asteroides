import { World, BlueprintRegistryMap } from "../ecs/World";
import { ComponentRegistry } from "../ecs/Component";
import { CoreComponentRegistry } from "../ecs/CoreComponents";
import { EventRegistry, EventBus } from "../events/EventBus";
import { IInputSystem } from "../input/InputSystem";
import { GameLoop } from "../loop/GameLoop";
import { Simulation } from "./Simulation";

/**
 * Lifecycle hook contract for initializing, spawning entities, and tearing down game sessions.
 *
 * @remarks
 * Implementers can define or mock lifecycle hooks during startup (`init()`) and session resets (`restart()`).
 *
 * @public
 */
export interface IGameLifecycleHooks {
  /**
   * Hook called during game initialization (`init()`).
   * Used to register ECS systems on the `World` schedule.
   */
  onRegisterSystems(): Promise<void>;

  /**
   * Hook called during game initialization (`init()`) after system registration.
   * Used to populate the `World` with initial entities, resources, and active scenes.
   */
  onInitializeEntities(): Promise<void>;

  /**
   * Hook called at the beginning of `restart()` before existing systems and listeners are destroyed.
   * Used for teardown, saving scores, or stats collection.
   */
  onBeforeRestart(): Promise<void>;
}

/**
 * Interface representing a runnable game instance.
 *
 * @typeParam TState - The representation of the game state payload.
 * @typeParam TInput - The dictionary structure representing user inputs.
 *
 * @public
 */
export interface IGame<
  TState = unknown,
  TInput extends Record<string, unknown> = Record<string, unknown>,
  TComponents extends ComponentRegistry = CoreComponentRegistry,
  TEvents extends EventRegistry = EventRegistry,
  TBlueprints extends BlueprintRegistryMap<TComponents> = BlueprintRegistryMap<TComponents>
> extends Simulation {
  /** Returns the active `World` container instance. */
  getWorld(): World<TComponents, TEvents, TBlueprints>;

  /** Returns the central `EventBus` instance used for event communications. */
  getEventBus(): EventBus<TEvents>;

  /** Returns the underlying `GameLoop` ticker driving the simulation. */
  getGameLoop(): GameLoop;

  /** Returns the current high-level state representation. */
  getGameState(): TState;

  /** Checks whether the game simulation has reached a game-over terminal condition. */
  isGameOver(): boolean;

  /** Returns the gameplay seed used for pseudo-random number generation. */
  getSeed(): number;

  /**
   * Asynchronously initializes systems and entities before starting the game loop.
   *
   * @returns Promise that resolves once initialization completes.
   */
  init(): Promise<void>;

  /** Starts the game loop. */
  start(): void;

  /** Pauses the game loop idempotently. */
  pause(): void;

  /** Resumes the game loop idempotently if currently paused. */
  resume(): void;

  /** Stops the game loop and cleans up registered systems and listeners. */
  destroy(): void;

  /**
   * Re-initializes the game session from scratch with an optional new random seed.
   *
   * @param seed - Optional new seed to override existing gameplay random seed.
   */
  restart(seed?: number): Promise<void>;

  /**
   * Subscribes a callback to receive game state updates on render ticks.
   *
   * @param callback - Function invoked with updated `TState`.
   * @returns Unsubscribe function.
   */
  subscribe(callback: (state: TState) => void): () => void;

  /** Returns whether the game is currently paused. */
  isPausedState(): boolean;

  /** Returns the unified input system instance. */
  getInputSystem(): IInputSystem<TInput>;

  /**
   * Updates input state overrides on the input system.
   *
   * @param input - Partial record of input actions and pressed states.
   */
  setInputState(input: Partial<TInput>): void;

  /**
   * Enters soft pause / gameplay freeze state.
   *
   * @param duration - Optional freeze duration in seconds.
   */
  enterGameplayFreeze(duration?: number): void;

  /** Exits soft pause / gameplay freeze state. */
  exitGameplayFreeze(): void;

  /** Returns whether gameplay is currently in a soft pause / gameplay freeze state. */
  isGameplayFrozen(): boolean;

  /** Returns remaining duration in seconds of gameplay freeze, or `undefined` if unfrozen or infinite. */
  getGameplayFreezeRemaining(): number | undefined;
}
