import { GameDefinition } from "./GameDefinition";
import { Simulation } from "./Simulation";
import { CompactInputFrame } from "../input/InputFrame";
import { DeterministicReplayRecorder } from "../replay/DeterministicReplay";
import { ArcadeKernel, ArcadeState } from "./ArcadeKernel";
import { EventBus } from "../events/EventBus";
import { GameLoop } from "../loop/GameLoop";

/**
 * Interface extension representing optional IGame/BaseGame capabilities present on simulation instances.
 */
type GameSessionSimulation = Simulation & {
  kernel?: ArcadeKernel;
  getGameLoop?: () => GameLoop | undefined;
  isGameOver?: () => boolean;
  getEventBus?: () => EventBus | undefined;
  eventBus?: EventBus;
};

/**
 * Orchestrates a live, active gameplay session for a given `GameDefinition`.
 *
 * @remarks
 * `GameSession` manages tick advancement, input history logging, deterministic replay recording,
 * and event broadcasting. When instantiated, it automatically deactivates any legacy game loop ticker on the
 * simulation (by calling `stopInternalLoop()`) to prevent dual-ticking when driven externally.
 *
 * @public
 */
export class GameSession {
  /** Unique session identifier. */
  public readonly id: string;
  /** Player identifier associated with the session. */
  public readonly playerId: string;
  /** The metadata and simulation factory definition powering this session. */
  public readonly gameDefinition: GameDefinition;
  /** Initial gameplay seed used to instantiate the deterministic simulation. */
  public readonly seed: number;
  /** The underlying pure simulation instance driven by this session. */
  public readonly simulation: Simulation;
  /** Central `ArcadeKernel` managing state machine transitions for this session. */
  public readonly kernel: ArcadeKernel;
  private recorder: DeterministicReplayRecorder;
  private inputHistory: CompactInputFrame[] = [];

  /**
   * Constructs a new `GameSession`.
   *
   * @param gameDefinition - The game specification providing `createSimulation`.
   * @param seed - Random seed for simulation state initialization.
   * @param playerId - Player identifier. Defaults to `"local-player"`.
   * @param sessionId - Session identifier. Defaults to `"session-1"`.
   * @param kernel - Optional `ArcadeKernel` instance. If omitted, attempts to reuse simulation kernel or creates a new one.
   */
  constructor(
    gameDefinition: GameDefinition,
    seed: number,
    playerId = "local-player",
    sessionId = "session-1",
    kernel?: ArcadeKernel
  ) {
    this.id = sessionId;
    this.playerId = playerId;
    this.gameDefinition = gameDefinition;
    this.seed = seed;
    this.simulation = gameDefinition.createSimulation(seed);
    const sim = this.simulation as GameSessionSimulation;
    this.kernel = kernel ?? sim.kernel ?? new ArcadeKernel();

    this.recorder = new DeterministicReplayRecorder(gameDefinition.name, seed);
    this.recorder.captureInitialState(this.simulation);

    // Ensure that if the simulation has a legacy game loop, we disable its automatic ticker
    if (sim && typeof sim.getGameLoop === "function") {
      const loop = sim.getGameLoop();
      if (loop && typeof loop.stopInternalLoop === "function") {
        loop.stopInternalLoop();
      }
    }
  }

  /**
   * Advances the gameplay session by exactly one tick using the provided input frame.
   *
   * @remarks
   * Step execution pipeline:
   * 1. Advances simulation state via `simulation.step(input)`.
   * 2. Logs input to replay recorder and local input history.
   * 3. Checks simulation game-over condition and transitions `kernel` to `ArcadeState.GAME_OVER` if needed.
   * 4. Broadcasts `session:tick` event on the simulation event bus for audio and presentation layers.
   *
   * @param input - Compact input frame containing tick index and action bitmasks.
   */
  public playTick(input: CompactInputFrame): void {
    // 1. Advance simulation state
    this.simulation.step(input);

    // 2. Record inputs to replay buffer and local history
    this.recorder.recordFrame(input);
    this.inputHistory.push({ ...input });

    // 3. Transition to GAME_OVER if simulation is over and kernel is in PLAYING
    const sim = this.simulation as GameSessionSimulation;
    const isGameOverFn = sim.isGameOver;
    if (typeof isGameOverFn === "function" && isGameOverFn.call(this.simulation)) {
      if (this.kernel.getState() === ArcadeState.PLAYING) {
        this.kernel.transitionTo(ArcadeState.GAME_OVER);
      }
    }

    // 4. Broadcast events that occurred this frame (as pure side-effects, e.g. for audio/visual presentation)
    const eventBus = sim.eventBus || (typeof sim.getEventBus === "function" ? sim.getEventBus() : undefined);
    if (eventBus && typeof eventBus.emit === "function") {
      eventBus.emit("session:tick", { tick: this.simulation.tick, state: this.simulation.state });
    }
  }

  /**
   * Retrieves a shallow copy of the input history logged so far during this session.
   *
   * @returns Array of `CompactInputFrame` objects processed by the session.
   */
  public getInputsHistory(): CompactInputFrame[] {
    return [...this.inputHistory];
  }

  /**
   * Compiles and returns the final deterministic replay file data structure for this session.
   *
   * @returns Compiled deterministic replay payload.
   */
  public getReplay() {
    return this.recorder.compileReplay();
  }
}
