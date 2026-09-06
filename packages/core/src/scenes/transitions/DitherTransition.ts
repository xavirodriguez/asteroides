import { RenderContext } from "../../rendering/Renderer";
import { TransitionOptions } from "../TransitionTypes";
import { BaseTransitionEffect } from "./BaseTransitionEffect";

/**
 * A dithered checkered fade utilizing a standard 4x4 Bayer matrix.
 * Simulates limited retro/arcade color resolution and hardware.
 *
 * @public
 */
export class DitherTransition extends BaseTransitionEffect {
  protected override readonly autoSave = false;

  private static readonly BAYER_4X4 = [
    [ 0,  8,  2, 10],
    [12,  4, 14,  6],
    [ 3, 11,  1,  9],
    [15,  7, 13,  5]
  ];

  /**
   * Paints the dithered bayer grid effect.
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
    const blockSize = options?.blockSize ?? 8;

    let ditherProgress = 0;
    if (progress <= 0.5) {
      ditherProgress = progress / 0.5; // 0.0 -> 1.0 (fade-out to solid)
    } else {
      ditherProgress = 1 - ((progress - 0.5) / 0.5); // 1.0 -> 0.0 (fade-in from solid)
    }

    if (ditherProgress <= 0) return;
    const cCtx = ctx as CanvasRenderingContext2D;
    if (ditherProgress >= 1) {
      cCtx.save();
      cCtx.fillStyle = color;
      cCtx.fillRect(0, 0, width, height);
      cCtx.restore();
      return;
    }

    cCtx.save();
    cCtx.fillStyle = color;
    const cols = Math.ceil(width / blockSize);
    const rows = Math.ceil(height / blockSize);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const val = DitherTransition.BAYER_4X4[r % 4][c % 4];
        if (val < ditherProgress * 16) {
          cCtx.fillRect(c * blockSize, r * blockSize, blockSize, blockSize);
        }
      }
    }
    cCtx.restore();
  }
}
