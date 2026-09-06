import { RenderContext } from "../../rendering/Renderer";
import { ITransitionEffect, TransitionOptions } from "../TransitionTypes";

/**
 * Abstract base class for single-scene transition effects.
 * Standardizes canvas availability checks, dimension defaults (800x600),
 * and optional automatic `ctx.save()` / `ctx.restore()` wrapping around `paint()`.
 *
 * @public
 */
export abstract class BaseTransitionEffect implements ITransitionEffect {
  /**
   * Indicates whether the transition requires rendering both old and new scenes simultaneously.
   */
  public readonly drawsBothScenes?: boolean;

  /**
   * Whether to automatically wrap `paint()` execution with `ctx.save()` and `ctx.restore()`.
   * Subclasses with early-returns prior to `ctx.save()` should override this to `false`.
   */
  protected readonly autoSave: boolean = true;

  /**
   * Renders the transition effect on top of the rendered frame.
   *
   * @param ctx - The render context (e.g. CanvasRenderingContext2D).
   * @param progress - Normalized progress of the overall transition, from 0.0 to 1.0.
   * @param options - Configured transition options.
   */
  public render(ctx: RenderContext, progress: number, options?: TransitionOptions): void {
    const c = ctx as CanvasRenderingContext2D;
    const canvas = c.canvas;
    if (!canvas) return;

    const width = canvas.width ?? 800;
    const height = canvas.height ?? 600;

    if (this.autoSave && typeof c.save === "function") {
      c.save();
      this.paint(ctx, progress, width, height, options);
      if (typeof c.restore === "function") {
        c.restore();
      }
    } else {
      this.paint(ctx, progress, width, height, options);
    }
  }

  /**
   * Abstract paint hook executed when canvas is valid.
   *
   * @param ctx - The render context.
   * @param progress - Transition progress from 0.0 to 1.0.
   * @param width - Resolved canvas width.
   * @param height - Resolved canvas height.
   * @param options - Configured transition options.
   */
  protected abstract paint(
    ctx: RenderContext,
    progress: number,
    width: number,
    height: number,
    options?: TransitionOptions
  ): void;
}

/**
 * Abstract base class for dual-scene transition effects requiring an offscreen canvas.
 * Standardizes both canvas and `offscreenCanvas` guard checks.
 *
 * @public
 */
export abstract class BaseOffscreenTransitionEffect extends BaseTransitionEffect {
  /**
   * Set flag to indicate that both scenes should be drawn.
   */
  public override readonly drawsBothScenes: boolean = true;

  /**
   * Renders the two-scene transition effect after ensuring offscreen canvas availability.
   *
   * @param ctx - The render context.
   * @param progress - Transition progress from 0.0 to 1.0.
   * @param options - Configured transition options.
   */
  public override render(ctx: RenderContext, progress: number, options?: TransitionOptions): void {
    const off = options?.offscreenCanvas;
    if (!off) return;
    super.render(ctx, progress, options);
  }

  /**
   * Delegated paint hook ensuring `offscreenCanvas` is present.
   *
   * @param ctx - The render context.
   * @param progress - Transition progress from 0.0 to 1.0.
   * @param width - Resolved canvas width.
   * @param height - Resolved canvas height.
   * @param options - Configured transition options.
   */
  protected override paint(
    ctx: RenderContext,
    progress: number,
    width: number,
    height: number,
    options?: TransitionOptions
  ): void {
    const off = options?.offscreenCanvas as CanvasImageSource | HTMLCanvasElement;
    if (off) {
      this.paintOffscreen(ctx, off, progress, width, height, options);
    }
  }

  /**
   * Abstract paint hook for offscreen transitions.
   *
   * @param ctx - The render context.
   * @param offscreenCanvas - The offscreen canvas containing the outgoing scene.
   * @param progress - Transition progress from 0.0 to 1.0.
   * @param width - Resolved canvas width.
   * @param height - Resolved canvas height.
   * @param options - Configured transition options.
   */
  protected abstract paintOffscreen(
    ctx: RenderContext,
    offscreenCanvas: CanvasImageSource | HTMLCanvasElement,
    progress: number,
    width: number,
    height: number,
    options?: TransitionOptions
  ): void;
}
