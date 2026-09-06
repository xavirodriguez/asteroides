import { RenderContext } from "../../rendering/Renderer";
import { TransitionOptions } from "../TransitionTypes";
import { BaseOffscreenTransitionEffect } from "./BaseTransitionEffect";

/**
 * A retro CRT/Signal Glitch transition effect.
 * Distorts the scene horizontally, slices the screen, and draws scanline artifacts.
 *
 * @public
 */
export class CRTGlitchTransition extends BaseOffscreenTransitionEffect {
  /**
   * Paints the signal glitch effect.
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
    // 1. Draw horizontal displacement slices
    const sliceHeight = options?.sliceHeight ?? 8;
    const numSlices = Math.ceil(height / sliceHeight);
    const intensity = options?.intensity ?? 1.0;

    // Wobble amplitude fades towards the end
    const amplitude = 30 * intensity * (1 - progress);

    const cCtx = ctx as CanvasRenderingContext2D;

    for (let i = 0; i < numSlices; i++) {
      const y = i * sliceHeight;
      // Procedural displacement wave using sine
      const wave = Math.sin(y * 0.05 + progress * 50) * amplitude;
      // Add occasional static jump/glitch
      const offset = (Math.sin(y * 0.5 + progress * 100) > 0.8) ? wave * 2 : wave;

      cCtx.drawImage(offscreenCanvas, 0, y, width, sliceHeight, offset, y, width, sliceHeight);
    }

    // 2. Draw rolling horizontal interference line
    const rollY = (progress * height * 2) % height;
    cCtx.fillStyle = "rgba(255, 255, 255, 0.15)";
    cCtx.fillRect(0, rollY, width, 6);

    // 3. Draw a vintage RGB color separation overlay
    if (progress < 0.8) {
      cCtx.globalCompositeOperation = "screen";
      cCtx.fillStyle = "rgba(255, 0, 0, 0.1)";
      cCtx.fillRect(2, 0, width, height);
      cCtx.fillStyle = "rgba(0, 0, 255, 0.1)";
      cCtx.fillRect(-2, 0, width, height);
    }
  }
}
