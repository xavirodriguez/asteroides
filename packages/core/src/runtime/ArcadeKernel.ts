import { EventBus } from "../events/EventBus";

/**
 * Representation of the high-level application and session flow states in the Arcade Kernel.
 *
 * @remarks
 * Valid state flow follows explicit transition rules managed by `ArcadeKernel`:
 * - `BOOT` -\> `LOADING`
 * - `LOADING` -\> `TITLE` | `MENU`
 * - `TITLE` -\> `MENU` | `PLAYING`
 * - `MENU` -\> `PLAYING` | `LOADING` | `STORY`
 * - `PLAYING` -\> `PAUSED` | `GAME_OVER` | `MENU` | `STORY`
 * - `PAUSED` -\> `PLAYING` | `MENU` | `GAME_OVER`
 * - `GAME_OVER` -\> `PLAYING` | `MENU` | `TITLE`
 * - `STORY` -\> `PLAYING` | `MENU`
 *
 * @public
 */
export enum ArcadeState {
  /** Initial engine boot and resource initialization state. */
  BOOT = "BOOT",
  /** Asynchronous asset or scene loading state. */
  LOADING = "LOADING",
  /** Retro splash / title screen presentation state. */
  TITLE = "TITLE",
  /** Main game selector or options menu state. */
  MENU = "MENU",
  /** Active deterministic gameplay simulation state. */
  PLAYING = "PLAYING",
  /** Paused gameplay simulation state. */
  PAUSED = "PAUSED",
  /** End-of-session game over state displaying final score and stats. */
  GAME_OVER = "GAME_OVER",
  /** Narrative or choose-your-own-adventure dialogue state. */
  STORY = "STORY"
}

/**
 * Valid transitions definition map to enforce flow determinism.
 */
const VALID_TRANSITIONS: Record<ArcadeState, Set<ArcadeState>> = {
  [ArcadeState.BOOT]: new Set([ArcadeState.LOADING]),
  [ArcadeState.LOADING]: new Set([ArcadeState.TITLE, ArcadeState.MENU]),
  [ArcadeState.TITLE]: new Set([ArcadeState.MENU, ArcadeState.PLAYING]),
  [ArcadeState.MENU]: new Set([ArcadeState.PLAYING, ArcadeState.LOADING, ArcadeState.STORY]),
  [ArcadeState.PLAYING]: new Set([ArcadeState.PAUSED, ArcadeState.GAME_OVER, ArcadeState.MENU, ArcadeState.STORY]),
  [ArcadeState.PAUSED]: new Set([ArcadeState.PLAYING, ArcadeState.MENU, ArcadeState.GAME_OVER]),
  [ArcadeState.GAME_OVER]: new Set([ArcadeState.PLAYING, ArcadeState.MENU, ArcadeState.TITLE]),
  [ArcadeState.STORY]: new Set([ArcadeState.PLAYING, ArcadeState.MENU])
};

/**
 * Central state machine orchestrating high-level application flows and retro game session transitions.
 *
 * @remarks
 * `ArcadeKernel` enforces deterministic state transitions across explicit `ArcadeState` values.
 * It decouples frontend presentation layers (React Native / web UI) from low-level ECS simulation logic.
 * When a valid state change occurs, it broadcasts an `arcade:state_changed` event via its `EventBus`.
 *
 * @public
 */
export class ArcadeKernel {
  private currentState: ArcadeState = ArcadeState.BOOT;
  private eventBus: EventBus;

  /**
   * Constructs an instance of `ArcadeKernel`.
   *
   * @param eventBus - Optional custom `EventBus` instance. Defaults to a new `EventBus`.
   */
  constructor(eventBus?: EventBus) {
    this.eventBus = eventBus ?? new EventBus();
  }

  /**
   * Retrieves the current active `ArcadeState`.
   *
   * @returns The active state enum value.
   */
  public getState(): ArcadeState {
    return this.currentState;
  }

  /**
   * Transitions the application flow to a target state if valid according to transition rules.
   *
   * @remarks
   * If `nextState` matches `currentState`, the operation is a no-op.
   * If the transition is disallowed, an `Error` is thrown to maintain application flow invariants.
   * On success, emits `arcade:state_changed` with `{ from, to, ...payload }`.
   *
   * @param nextState - The target `ArcadeState` to transition into.
   * @param payload - Optional metadata to attach to the `arcade:state_changed` event emission.
   * @throws Error - If transitioning from the current state to `nextState` is invalid.
   */
  public transitionTo(nextState: ArcadeState, payload?: Record<string, unknown>): void {
    if (this.currentState === nextState) return;

    const allowed = VALID_TRANSITIONS[this.currentState];
    if (!allowed || !allowed.has(nextState)) {
      throw new Error(`[ArcadeKernel] Invalid transition: Cannot transition from ${this.currentState} to ${nextState}`);
    }

    const previousState = this.currentState;
    this.currentState = nextState;

    this.eventBus.emit("arcade:state_changed", {
      from: previousState,
      to: nextState,
      ...payload
    });
  }
}
