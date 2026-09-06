import { RenderContext } from "../../rendering/Renderer";
import { TransitionOptions } from "../TransitionTypes";
import { BaseOffscreenTransitionEffect } from "./BaseTransitionEffect";

/**
 * A vintage clock-like radial sweep wipe.
 * Sweeps a radial sector mask from 0 to 360 degrees.
 *
 * @public
 */
export class RadialWipeTransition extends BaseOffscreenTransitionEffect {
  /**
   * Paints the radial Clock wipe.
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
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.sqrt(cx * cx + cy * cy);
    const startAngle = -Math.PI / 2; // top center
    const endAngle = startAngle + Math.PI * 2 * (1 - progress);

    cCtx.beginPath();
    cCtx.moveTo(cx, cy);
    cCtx.arc(cx, cy, radius, startAngle, endAngle);
    cCtx.closePath();
    cCtx.clip();

    cCtx.drawImage(offscreenCanvas, 0, 0);
  }
}
