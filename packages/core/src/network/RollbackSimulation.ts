import { Simulation } from "../runtime/Simulation";
import { SnapshotBuffer } from "../snapshots/SnapshotBuffer";
import { CompactInputFrame } from "../input/InputFrame";

/**
 * Orchestrates rollback and resimulation for client-side prediction and lag compensation.
 * @public
 */
export class RollbackSimulation {
  private simulation: Simulation;
  private rollbackBuffer: SnapshotBuffer;

  constructor(simulation: Simulation, rollbackBuffer: SnapshotBuffer) {
    this.simulation = simulation;
    this.rollbackBuffer = rollbackBuffer;
  }

  /**
   * Resimulates input frames sequentially starting from `startTick` up to `currentTick`.
   *
   * @param startTick - Starting tick index for resimulation.
   * @param currentTick - Target tick index to resimulate up to.
   * @param inputsHistory - Map of input frames per tick index.
   * @param localHashes - Optional map to update state hashes during resimulation.
   */
  public resimulateFromTick(
    startTick: number,
    currentTick: number,
    inputsHistory: Map<number, CompactInputFrame>,
    localHashes?: Map<number, string>
  ): void {
    const simAccess = this.simulation as unknown as { world?: import("../ecs/World").World; getWorld?: () => import("../ecs/World").World };
    const world = simAccess.world ?? simAccess.getWorld?.();
    const prevIsReSimulating = world ? world.isReSimulating : false;
    const random = world ? world.gameplayRandom : undefined;
    const wasLocked = random ? random.isLocked() : false;

    if (world) {
      world.isReSimulating = true;
    }
    if (random && wasLocked) {
      random.unlock();
    }

    try {
      for (let t = startTick; t <= currentTick; t++) {
        // Save state snapshot of tick t BEFORE executing its step
        this.rollbackBuffer.saveSnapshot(t, this.simulation.snapshot());

        let input = inputsHistory.get(t);
        if (!input) {
          // Fallback in case input is missing: keep buttons empty, set correct tick
          input = { t, b: 0 };
          inputsHistory.set(t, input);
        }
        this.simulation.step(input);

        if (localHashes) {
          localHashes.set(t + 1, this.simulation.hash());
        }
      }
    } finally {
      if (random && wasLocked) {
        random.lock();
      }
      if (world) {
        world.isReSimulating = prevIsReSimulating;
      }
    }
  }

  /**
   * Executes a rollback and resimulation cycle.
   *
   * @param targetTick - The tick index where the input correction was received.
   * @param correctedInput - The validated or corrected input frame for the target tick.
   * @param currentTick - The current tick index before the rollback.
   * @param inputsHistory - Map of previously predicted inputs recorded per tick index.
   * @returns true if rollback was executed, false if snapshot was not found in circular buffer.
   */
  public processRollback(
    targetTick: number,
    correctedInput: CompactInputFrame,
    currentTick: number,
    inputsHistory: Map<number, CompactInputFrame>
  ): boolean {
    // 1. Load the state snapshot at targetTick (representing state of tick T BEFORE step T is executed)
    const snapshot = this.rollbackBuffer.loadSnapshot(targetTick);
    if (!snapshot) {
      return false; // Snapshot has already fallen out of the sliding window
    }

    // 2. Restore simulation to targetTick
    this.simulation.restore(snapshot);

    // Ensure the buffer is kept intact for targetTick
    this.rollbackBuffer.saveSnapshot(targetTick, snapshot);

    // 3. Apply corrected input frame at targetTick (advances simulation to targetTick + 1)
    this.simulation.step(correctedInput);
    inputsHistory.set(targetTick, correctedInput);

    // 4. Fast-forward / Resimulate up to currentTick
    this.resimulateFromTick(targetTick + 1, currentTick, inputsHistory);

    return true;
  }
}
