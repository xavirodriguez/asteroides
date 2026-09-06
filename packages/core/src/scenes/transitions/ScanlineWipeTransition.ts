import { RenderContext } from "../../rendering/Renderer";
import { TransitionOptions } from "../TransitionTypes";
import { BaseTransitionEffect } from "./BaseTransitionEffect";

/**
 * Scanline / CRT Wipe transition.
 * Sweeps a horizontal electron beam line from top to bottom, replacing the scene.
 *
 * @public
 */
export class ScanlineWipeTransition extends BaseTransitionEffect {
  /**
   * Paints the Scanline CRT sweep effect.
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
    const lineColor = options?.lineColor ?? "#00FFFF";
    const lineWidth = options?.lineWidth ?? 4;

    let sweepY = 0;
    let isOutPhase = true;

    if (progress <= 0.5) {
      const t = progress / 0.5; // 0.0 -> 1.0
      sweepY = height * t;
      isOutPhase = true;
    } else {
      const t = (progress - 0.5) / 0.5; // 0.0 -> 1.0
      sweepY = height * t;
      isOutPhase = false;
    }

    const cCtx = ctx as CanvasRenderingContext2D;

    // 1. Draw solid color coverage area
    cCtx.fillStyle = color;
    if (isOutPhase) {
      // Solid behind the sweep line (already wiped out)
      cCtx.fillRect(0, 0, width, sweepY);
    } else {
      // Solid in front of the sweep line (yet to be revealed)
      cCtx.fillRect(0, sweepY, width, height - sweepY);
    }

    // 2. Draw glowing neon sweep line
    if (sweepY > 0 && sweepY < height) {
      // Outer glow
      cCtx.strokeStyle = lineColor;
      cCtx.lineWidth = lineWidth * 2;
      cCtx.globalAlpha = 0.4;
      cCtx.beginPath();
      cCtx.moveTo(0, sweepY);
      cCtx.lineTo(width, sweepY);
      cCtx.stroke();

      // Inner core
      cCtx.strokeStyle = "#FFFFFF";
      cCtx.lineWidth = lineWidth / 2;
      cCtx.globalAlpha = 1.0;
      cCtx.beginPath();
      cCtx.moveTo(0, sweepY);
      cCtx.lineTo(width, sweepY);
      cCtx.stroke();
    }
  }
}
