import { RenderContext } from "../../rendering/Renderer";
import { TransitionOptions } from "../TransitionTypes";
import { BaseOffscreenTransitionEffect } from "./BaseTransitionEffect";

/**
 * A smooth cross-dissolve/blending transition between scenes.
 * Renders both the outgoing and incoming scenes blended together.
 *
 * @public
 */
export class CrossfadeTransition extends BaseOffscreenTransitionEffect {
  /**
   * Paints the crossfade transition effect.
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
    cCtx.globalAlpha = Math.max(0, Math.min(1, 1 - progress));
    cCtx.drawImage(offscreenCanvas, 0, 0);
  }
}
