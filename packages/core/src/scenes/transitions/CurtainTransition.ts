import { RenderContext } from "../../rendering/Renderer";
import { TransitionOptions } from "../TransitionTypes";
import { BaseOffscreenTransitionEffect } from "./BaseTransitionEffect";

/**
 * A classic curtain-split transition.
 * Splits the old scene down the center and slides both halves outward to reveal the new scene.
 *
 * @public
 */
export class CurtainTransition extends BaseOffscreenTransitionEffect {
  /**
   * Paints the curtain split visual.
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
    const shift = progress * (width / 2);

    // Left half
    cCtx.drawImage(offscreenCanvas, 0, 0, width / 2, height, -shift, 0, width / 2, height);
    // Right half
    cCtx.drawImage(offscreenCanvas, width / 2, 0, width / 2, height, width / 2 + shift, 0, width / 2, height);
  }
}
