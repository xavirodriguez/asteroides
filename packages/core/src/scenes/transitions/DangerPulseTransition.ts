import { RenderContext } from "../../rendering/Renderer";
import { TransitionOptions } from "../TransitionTypes";
import { BaseTransitionEffect } from "./BaseTransitionEffect";

/**
 * A pulsating red Danger vignette transition.
 * Simulates a heartbeat low-health warning.
 *
 * @public
 */
export class DangerPulseTransition extends BaseTransitionEffect {
  /**
   * Set drawsBothScenes to false to simply overlay on top of whatever is already rendered on the active scene.
   */
  public override readonly drawsBothScenes = false;

  private cachedGrad?: CanvasGradient | unknown;
  private cachedCtx?: RenderContext;
  private cachedCX?: number;
  private cachedCY?: number;
  private cachedInnerR?: number;
  private cachedOuterR?: number;
  private cachedColor?: string;

  /**
   * Paints the low-HP danger vignette pulse.
   *
   * @param ctx - The render context.
   * @param progress - Transition progress from 0.0 to 1.0 (used as time/pulse driver).
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
    const cx = options?.centerX ?? (width / 2);
    const cy = options?.centerY ?? (height / 2);
    const color = options?.color ?? "#FF0000";

    // Pulsate opacity based on progress
    const frequency = options?.frequency ?? 4; // Number of heartbeats
    const wave = Math.sin(progress * Math.PI * 2 * frequency);
    const pulseOpacity = 0.15 + 0.35 * Math.max(0, wave); // Clamp positive wave only

    const innerRadius = Math.min(width, height) * 0.25;
    const outerRadius = Math.sqrt(cx * cx + cy * cy);

    const c = ctx as CanvasRenderingContext2D;

    if (
      !this.cachedGrad ||
      this.cachedCtx !== ctx ||
      this.cachedCX !== cx ||
      this.cachedCY !== cy ||
      this.cachedInnerR !== innerRadius ||
      this.cachedOuterR !== outerRadius ||
      this.cachedColor !== color
    ) {
      const grad = c.createRadialGradient(cx, cy, innerRadius, cx, cy, outerRadius);
      grad.addColorStop(0, "rgba(0, 0, 0, 0)");
      grad.addColorStop(1, color);
      this.cachedGrad = grad;
      this.cachedCtx = ctx;
      this.cachedCX = cx;
      this.cachedCY = cy;
      this.cachedInnerR = innerRadius;
      this.cachedOuterR = outerRadius;
      this.cachedColor = color;
    }

    c.fillStyle = this.cachedGrad as CanvasGradient;
    c.globalAlpha = pulseOpacity;
    c.fillRect(0, 0, width, height);
  }
}
