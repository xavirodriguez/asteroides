import { FrameScheduler, browserFrameScheduler } from "./FrameScheduler";

/** @public */
export type RenderCallback = (alpha: number) => void;
/** @public */
export type UpdateCallback = (dt: number) => void;

/**
 * Configuration options for the GameLoop.
 * @public
 */
export interface GameLoopConfig {
  /**
   * The fixed timestep in seconds. Defaults to 1/60.
   */
  step?: number;
  /**
   * The maximum allowed delta time per frame in seconds to prevent "spiral of death".
   */
  maxDelta?: number;
  /**
   * The scheduler used for timing and frame requests.
   */
  scheduler?: FrameScheduler;
  /**
   * If true, the loop will not automatically schedule frames.
   * Useful when an external driver (like Reanimated) calls `tick()` manually.
   */
  manual?: boolean;
  /**
   * Optional callback triggered when the loop is manual, running, and no tick has been received for the timeout duration.
   */
  onWatchdogTimeout?: () => void;
  /**
   * Watchdog timeout in milliseconds. Defaults to 5000.
   */
  watchdogTimeout?: number;
}

/**
 * A platform-agnostic game loop implementation using a fixed-timestep accumulator.
 *
 * @remarks
 * The `GameLoop` decouples internal physics/simulation updates from rendering frame rates using a fixed-timestep accumulator.
 *
 * **Key Architectural Modes & Lifecycle Rules**:
 * - **Automatic Mode (`manual: false`)**: Uses a {@link FrameScheduler} (e.g. `browserFrameScheduler` or `requestAnimationFrame`) to continuously run `tick()`.
 * - **Manual Mode (`manual: true`)**: Allows external drivers (such as React Native Reanimated or custom tickers) to call `tick()` directly.
 * - **Watchdog Protection**: In manual mode, a watchdog timer monitors tick intervals. If no `tick()` is received within `watchdogTimeout` ms (default 5000ms), `onWatchdogTimeout` fires to alert of driver stalls.
 * - **Spiral of Death Mitigation**: Clamps `deltaTime` to `maxDelta` (default 0.25s) to avoid unrecoverable simulation lag cascades under heavy loads.
 * - **Delta Units**: Update callbacks receive delta time strictly in seconds (e.g. `1/60 ~ 0.01667`).
 * - **Render Interpolation**: Render callbacks receive an `alpha` factor (`0.0 <= alpha < 1.0`) representing fractional leftover time in the accumulator for sub-frame visual interpolation.
 *
 * @public
 */
export class GameLoop {
  private renderSubscribers: Set<RenderCallback> = new Set();
  private updateSubscribers: Set<UpdateCallback> = new Set();
  private errorSubscribers: Set<(err: Error) => void> = new Set();
  private lastError: Error | null = null;
  private lastTime = 0;
  private accumulator = 0;
  private readonly step: number;
  private readonly maxDelta: number;
  private readonly scheduler: FrameScheduler;
  public manual: boolean;
  private isRunning = false;
  private isPaused = false;
  private frameHandle: unknown;

  private lastTickTime = 0;
  private watchdogIntervalId: ReturnType<typeof setInterval> | undefined = undefined;
  private readonly watchdogTimeout: number;
  private readonly onWatchdogTimeout?: () => void;

  constructor(config: GameLoopConfig = {}) {
    this.step = config.step ?? 1 / 60;
    this.maxDelta = config.maxDelta ?? 0.25;
    this.scheduler = config.scheduler ?? browserFrameScheduler;
    this.manual = config.manual ?? false;
    this.watchdogTimeout = config.watchdogTimeout ?? 5000;
    this.onWatchdogTimeout = config.onWatchdogTimeout;
  }

  /**
   * Starts the game loop.
   */
  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTime = this.scheduler.now();
    this.lastTickTime = Date.now();
    if (!this.manual) {
      this.frameHandle = this.scheduler.requestFrame(this.loop);
    } else {
      this.startWatchdog();
    }
  }

  /**
   * Stops the game loop.
   */
  public stop() {
    this.isRunning = false;
    if (this.frameHandle !== undefined) {
      this.scheduler.cancelFrame(this.frameHandle);
      this.frameHandle = undefined;
    }
    this.stopWatchdog();
  }

  /**
   * Pauses the game loop.
   */
  public pause() {
    this.isPaused = true;
    this.stopWatchdog();
  }

  /**
   * Resumes the game loop.
   */
  public resume() {
    this.isPaused = false;
    this.lastTime = this.scheduler.now();
    this.lastTickTime = Date.now();
    if (this.manual) {
      this.startWatchdog();
    }
  }

  /**
   * Stops the internal automatic loop and switches to manual mode.
   */
  public stopInternalLoop() {
    this.manual = true;
    if (this.frameHandle !== undefined) {
      this.scheduler.cancelFrame(this.frameHandle);
      this.frameHandle = undefined;
    }
    this.startWatchdog();
  }

  private startWatchdog() {
    this.stopWatchdog();
    if (!this.manual || !this.isRunning || this.isPaused) return;

    this.watchdogIntervalId = setInterval(() => {
      if (this.isRunning && !this.isPaused) {
        const elapsed = Date.now() - this.lastTickTime;
        if (elapsed > this.watchdogTimeout) {
          console.warn(`[GameLoop] Watchdog alert: No tick received in manual mode for ${elapsed}ms (timeout: ${this.watchdogTimeout}ms). External driver might be stalled.`);
          if (this.onWatchdogTimeout) {
            this.onWatchdogTimeout();
          }
        }
      }
    }, 1000);
  }

  private stopWatchdog() {
    if (this.watchdogIntervalId !== undefined) {
      clearInterval(this.watchdogIntervalId);
      this.watchdogIntervalId = undefined;
    }
  }

  /**
   * Executes a single tick of the game loop.
   * @param currentTime - The current time in milliseconds. If not provided, the scheduler's time is used.
   */
  public tick(currentTime?: number) {
    if (!this.isRunning) return;

    this.lastTickTime = Date.now();

    try {
      // Use scheduler time if not provided
      const now = currentTime ?? this.scheduler.now();

      if (this.isPaused) {
        this.lastTime = now;
        return;
      }

      let deltaTime = (now - this.lastTime) / 1000;
      this.lastTime = now;

      // Prevent spiral of death
      if (deltaTime > this.maxDelta) {
        deltaTime = this.maxDelta;
      }

      this.accumulator += deltaTime;

      while (this.accumulator >= this.step) {
        // NOTE: The update subscriber receives deltaTime strictly in seconds (e.g. 1/60 ~ 0.01667 seconds).
        // Systems in this engine (such as AnimationSystem, TTLSystem, JuiceSystem, ComboSystem, ScreenShakeSystem, ParticleSystem)
        // must expect and process delta time consistently in seconds.
        this.updateSubscribers.forEach(sub => sub(this.step));
        this.accumulator -= this.step;
      }

      const alpha = this.accumulator / this.step;
      this.renderSubscribers.forEach(sub => sub(alpha));
    } catch (error: unknown) {
      this.stop();
      this.lastError = error instanceof Error ? error : new Error(String(error));
      console.error("[GameLoop] Critical exception in tick, stopping loop:", this.lastError);
      this.errorSubscribers.forEach(sub => sub(this.lastError!));
      throw error;
    }
  }

  private loop = (currentTime: number) => {
    this.tick(currentTime);

    if (this.isRunning && !this.manual) {
      this.frameHandle = this.scheduler.requestFrame(this.loop);
    }
  };

  /**
   * Subscribes a callback to be called every fixed update step.
   * @param callback - The callback receiving the fixed delta time.
   * @returns A function to unsubscribe.
   */
  public subscribeUpdate(callback: UpdateCallback): () => void {
    this.updateSubscribers.add(callback);
    return () => this.updateSubscribers.delete(callback);
  }

  /**
   * Subscribes a callback to be called every frame for rendering.
   * @param callback - The callback receiving the interpolation alpha.
   * @returns A function to unsubscribe.
   */
  public subscribeRender(callback: RenderCallback): () => void {
    this.renderSubscribers.add(callback);
    return () => this.renderSubscribers.delete(callback);
  }

  /**
   * Returns the last encountered error, if any.
   */
  public getLastError(): Error | null {
    return this.lastError;
  }

  /**
   * Subscribes a callback to be notified of critical loop exceptions.
   * @param callback - The callback receiving the error.
   * @returns A function to unsubscribe.
   */
  public subscribeError(callback: (err: Error) => void): () => void {
    this.errorSubscribers.add(callback);
    return () => this.errorSubscribers.delete(callback);
  }
}
