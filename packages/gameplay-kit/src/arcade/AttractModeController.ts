/**
 * Drives the simulation by injecting deterministic inputs on a game instance.
 * @public
 */
export class AttractModeController {
  private active = false;
  private currentSequenceIndex = 0;
  private currentSequenceElapsed = 0;
  private inputSequence: Array<{ duration: number; inputs: Record<string, boolean> }>;

  constructor(
    private game: any,
    sequence?: Array<{ duration: number; inputs: Record<string, boolean> }>
  ) {
    this.inputSequence = sequence || [
      { duration: 1.5, inputs: { moveLeft: true, moveRight: false, shoot: false } },
      { duration: 0.5, inputs: { moveLeft: false, moveRight: false, shoot: true } },
      { duration: 1.5, inputs: { moveLeft: false, moveRight: true, shoot: false } },
      { duration: 0.5, inputs: { moveLeft: false, moveRight: false, shoot: true } },
      { duration: 1.0, inputs: { moveLeft: false, moveRight: false, shoot: true } },
    ];
  }

  public start(): void {
    this.active = true;
    this.currentSequenceIndex = 0;
    this.currentSequenceElapsed = 0;
  }

  public stop(): void {
    this.active = false;
    // Reset all inputs to false
    if (this.game && typeof this.game.setInputState === "function") {
      this.game.setInputState({
        moveLeft: false,
        moveRight: false,
        shoot: false,
      });
    }
  }

  public update(dt: number): void {
    if (!this.active || this.inputSequence.length === 0 || !this.game) return;

    this.currentSequenceElapsed += dt;
    const current = this.inputSequence[this.currentSequenceIndex];

    if (this.currentSequenceElapsed >= current.duration) {
      this.currentSequenceElapsed = 0;
      this.currentSequenceIndex = (this.currentSequenceIndex + 1) % this.inputSequence.length;
    }

    const activeInputs = this.inputSequence[this.currentSequenceIndex].inputs;
    if (typeof this.game.setInputState === "function") {
      this.game.setInputState(activeInputs);
    }
  }

  public isActive(): boolean {
    return this.active;
  }
}
