import { World } from "../ecs/World";
import { InputFrame } from "../network/NetTypes";

/**
 * Utility class to play back recorded tick inputs deterministically.
 * @public
 */
export class ReplayPlayer {
  private inputs: InputFrame[];
  private currentTick = 0;
  private runSimulationStep?: (deltaTime: number, isResimulating: boolean) => void;

  constructor(inputs: InputFrame[], runSimStep?: (deltaTime: number, isResimulating: boolean) => void) {
    this.inputs = inputs;
    if (runSimStep) {
      this.runSimulationStep = runSimStep;
    }
  }

  /**
   * Plays a single tick of the recorded replay on the given World.
   */
  public playTick<TRegistry extends import("../ecs/Component").ComponentRegistry = import("../ecs/CoreComponents").CoreComponentRegistry>(world: World<TRegistry>, deltaTime: number): boolean {
    if (this.currentTick >= this.inputs.length) {
      return false; // Replay finished
    }

    const inputFrame = this.inputs[this.currentTick];

    // Find player entity
    let player = world.query("LocalPlayer")[0];
    if (player === undefined) {
      player = world.query("Player")[0];
    }

    if (player !== undefined) {
      const inputType = "Input" as Extract<keyof TRegistry, string>;
      if (!world.hasComponent(player, inputType)) {
        world.addComponent(player, {
          type: "Input",
          actions: new Set<string>(),
          axes: {}
        } as unknown as TRegistry[Extract<keyof TRegistry, string>] & { type: Extract<keyof TRegistry, string> });
      }

      world.mutateComponent(player, inputType, (inputComp) => {
        const ic = inputComp as Record<string, unknown> & { actions: Set<string>; axes: Record<string, number> };
        ic.actions = new Set<string>(inputFrame.actions || []);
        ic.axes = { ...inputFrame.axes };

        // Map logical actions directly onto individual game-specific boolean fields
        for (const action of inputFrame.actions) {
          ic[action] = true;
        }

        // Keep Space Invaders and Flappy Bird input state fields in sync
        const actionsToSync = ["moveLeft", "moveRight", "shoot", "flap", "glide", "thrust", "left", "right", "hyperspace"];
        for (const act of actionsToSync) {
          if (ic[act] !== undefined) {
            ic[act] = inputFrame.actions.includes(act);
          }
        }
      });
    }

    // Advance simulation step
    const random = world.gameplayRandom;
    const wasLocked = random ? random.isLocked() : false;
    if (random) {
      random.unlock();
    }
    try {
      if (this.runSimulationStep) {
        this.runSimulationStep(deltaTime, false);
      } else {
        world.update(deltaTime);
      }
    } finally {
      if (random && wasLocked) {
        random.lock();
      }
    }

    this.currentTick++;
    return true;
  }

  /**
   * Checks if the replay has reached its end.
   */
  public isFinished(): boolean {
    return this.currentTick >= this.inputs.length;
  }

  /**
   * Returns the current playback tick index.
   */
  public getCurrentTick(): number {
    return this.currentTick;
  }
}
