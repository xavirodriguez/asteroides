import { RenderContext } from "../../rendering/Renderer";
import { TransitionOptions } from "../TransitionTypes";
import { BaseOffscreenTransitionEffect } from "./BaseTransitionEffect";

/**
 * A sleek retro diagonal sweep wipe.
 * Clips the old scene to a diagonal polygon that slides top-left to bottom-right.
 *
 * @public
 */
export class DiagonalSweepTransition extends BaseOffscreenTransitionEffect {
  /**
   * Paints the diagonal sweep wipe.
   *
   * @param ctx - The CanvasRenderingContext2D or RenderContext.
   * @param offscreenCanvas - The offscreen canvas containing the outgoing scene.
   * @param progress - Transition progress from 0.0 to 1.0.
   * @param width - Canvas width.
   * @param height - Canvas height.
   * @param options - Visual configurations.
   */
  protected paintOffscreen(
    ctx: RenderContext,
    offscreenCanvas: CanvasImageSource | HTMLCanvasElement,
    progress: number,
    width: number,
    height: number,
    options?: TransitionOptions
  ): void {
    const cCtx = ctx as CanvasRenderingContext2D;
    // Diagonal frontier sweep line
    const maxDist = width + height;
    const currentDist = maxDist * (1 - progress);

    cCtx.beginPath();
    cCtx.moveTo(0, 0);
    cCtx.lineTo(currentDist, 0);
    cCtx.lineTo(0, currentDist);
    cCtx.closePath();
    cCtx.clip();

    cCtx.drawImage(offscreenCanvas, 0, 0);
  }
}
