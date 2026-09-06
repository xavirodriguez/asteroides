import { RenderContext } from "../../rendering/Renderer";
import { TransitionOptions } from "../TransitionTypes";
import { BaseTransitionEffect } from "./BaseTransitionEffect";

/**
 * A standard fade-to-color transition.
 * Interpolates opacity smoothly to full color at midpoint and back to transparent.
 *
 * @public
 */
export class FadeTransition extends BaseTransitionEffect {
  protected override readonly autoSave = false;

  /**
   * Paints the fade transition effect.
   *
   * @param ctx - The CanvasRenderingContext2D or RenderContext.
   * @param progress - Transition progress from 0.0 to 1.0.
   * @param width - Canvas width.
   * @param height - Canvas height.
   * @param options - Visual configurations.
   */
  protected paint(
    ctx: RenderContext,
    progress: number,
    width: number,
    height: number,
    options?: TransitionOptions
  ): void {
    const color = options?.color ?? "#000000";

    let opacity = 0;
    if (progress <= 0.5) {
      opacity = progress / 0.5; // 0.0 -> 1.0 (fade-out)
    } else {
      opacity = 1 - ((progress - 0.5) / 0.5); // 1.0 -> 0.0 (fade-in)
    }

    if (opacity <= 0) return;

    const c = ctx as CanvasRenderingContext2D;
    c.save();
    c.globalAlpha = opacity;
    c.fillStyle = color;
    c.fillRect(0, 0, width, height);
    c.restore();
  }
}
