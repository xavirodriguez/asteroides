import { World } from "../ecs/World";
import { InputSystem } from "../input/InputSystem";
import { InputFrame } from "../network/NetTypes";

/** @public */
export interface RecordedReplay {
  seed: number;
  inputs: InputFrame[];
  metadata?: Record<string, unknown>;
}

/**
 * Utility class to record tick inputs for game replay and Attract Mode.
 * @public
 */
export class ReplayRecorder {
  private inputs: InputFrame[] = [];
  private seed = 0;
  private actions: string[];
  private axes: string[];

  constructor(options: { actions: string[]; axes?: string[] }) {
    this.actions = options.actions;
    this.axes = options.axes || [];
  }

  /**
   * Starts recording inputs for a given seed.
   */
  public start(seed: number): void {
    this.inputs = [];
    this.seed = seed;
  }

  /**
   * Records a single tick's inputs from the World's InputSystem.
   */
  public recordTick(world: World, tick: number): void {
    const inputSystem = world.getResource<InputSystem>("InputSystem");
    if (!inputSystem) return;

    const activeActions: string[] = [];
    for (const action of this.actions) {
      if (inputSystem.getAction(action)) {
        activeActions.push(action);
      }
    }

    const activeAxes: Record<string, number> = {};
    for (const axis of this.axes) {
      // In case we want to support axes in future custom input systems
      const isys = inputSystem as unknown as { getAxis?: (axis: string) => number };
      if (typeof isys.getAxis === "function") {
        activeAxes[axis] = isys.getAxis(axis);
      }
    }

    this.inputs.push({
      tick,
      actions: activeActions,
      axes: activeAxes,
      timestamp: Date.now()
    });
  }

  /**
   * Stops recording and returns the compiled RecordedReplay.
   */
  public stop(metadata?: Record<string, unknown>): RecordedReplay {
    return {
      seed: this.seed,
      inputs: [...this.inputs],
      metadata
    };
  }

  /**
   * Returns currently recorded input frames.
   */
  public getInputs(): InputFrame[] {
    return this.inputs;
  }
}
