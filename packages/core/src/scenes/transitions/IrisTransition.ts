import { RenderContext } from "../../rendering/Renderer";
import { TransitionOptions } from "../TransitionTypes";
import { BaseTransitionEffect } from "./BaseTransitionEffect";

/**
 * An classic 8/16-bit retro Iris Wipe circular transition.
 * Uses a transparent circle mask that shrinks to 0 at midpoint, then expands.
 *
 * @public
 */
export class IrisTransition extends BaseTransitionEffect {
  /**
   * Paints the circular wipe effect.
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

    const cx = options?.centerX ?? (width / 2);
    const cy = options?.centerY ?? (height / 2);

    // Find maximum distance to any of the 4 screen corners to ensure coverage
    const distToLeft = cx;
    const distToRight = width - cx;
    const distToTop = cy;
    const distToBottom = height - cy;
    const maxRadius = Math.sqrt(
      Math.max(distToLeft, distToRight) ** 2 +
      Math.max(distToTop, distToBottom) ** 2
    );

    let currentRadius = 0;
    if (progress <= 0.5) {
      const t = progress / 0.5; // 0.0 -> 1.0
      currentRadius = maxRadius * (1 - t);
    } else {
      const t = (progress - 0.5) / 0.5; // 0.0 -> 1.0
      currentRadius = maxRadius * t;
    }

    const c = ctx as CanvasRenderingContext2D;
    c.fillStyle = color;
    c.beginPath();
    c.rect(0, 0, width, height);
    c.arc(cx, cy, currentRadius, 0, Math.PI * 2, true);
    c.fill("evenodd");
  }
}
