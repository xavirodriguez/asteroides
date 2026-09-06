import { RenderContext } from "../../rendering/Renderer";
import { TransitionOptions } from "../TransitionTypes";
import { BaseTransitionEffect } from "./BaseTransitionEffect";

let offscreenCanvas: HTMLCanvasElement | null = null;
let offscreenCtx: CanvasRenderingContext2D | null = null;

interface VendorPrefixedContext2D {
  mozImageSmoothingEnabled?: boolean;
  webkitImageSmoothingEnabled?: boolean;
  msImageSmoothingEnabled?: boolean;
}

function getOffscreen(width: number, height: number): { canvas: HTMLCanvasElement | null; ctx: CanvasRenderingContext2D | null } {
  if (typeof document === "undefined") {
    return { canvas: null, ctx: null };
  }
  try {
    if (!offscreenCanvas) {
      offscreenCanvas = document.createElement("canvas");
      offscreenCtx = offscreenCanvas.getContext("2d");
    }
    if (offscreenCanvas) {
      if (offscreenCanvas.width !== width || offscreenCanvas.height !== height) {
        offscreenCanvas.width = width;
        offscreenCanvas.height = height;
      }
    }
    return { canvas: offscreenCanvas, ctx: offscreenCtx };
  } catch {
    return { canvas: null, ctx: null };
  }
}

/**
 * Pixelation mosaic transition.
 * Gradually increases pixel block size up to a maximum at midpoint, then reverses.
 *
 * @public
 */
export class PixelateTransition extends BaseTransitionEffect {
  protected override readonly autoSave = false;

  /**
   * Paints the pixelated scale mosaic effect.
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
    const maxPixelSize = options?.maxPixelSize ?? 32;

    let blockSize = 1;
    if (progress <= 0.5) {
      const t = progress / 0.5; // 0.0 -> 1.0
      blockSize = 1 + (maxPixelSize - 1) * t;
    } else {
      const t = (progress - 0.5) / 0.5; // 0.0 -> 1.0
      blockSize = maxPixelSize - (maxPixelSize - 1) * t;
    }

    blockSize = Math.round(blockSize);
    if (blockSize <= 1) return;

    const { canvas: off, ctx: octx } = getOffscreen(width, height);
    if (!off || !octx) return;

    const w = Math.max(1, Math.floor(width / blockSize));
    const h = Math.max(1, Math.floor(height / blockSize));

    const cCtx = ctx as CanvasRenderingContext2D;
    cCtx.save();
    // 1. Copy full canvas down to tiny size on offscreen
    octx.clearRect(0, 0, width, height);
    if (cCtx.canvas) {
      octx.drawImage(cCtx.canvas, 0, 0, width, height, 0, 0, w, h);
    }

    // 2. Clear main canvas
    cCtx.clearRect(0, 0, width, height);

    // 3. Draw tiny offscreen image back stretched to fill main canvas without smoothing
    cCtx.imageSmoothingEnabled = false;
    const vendorCtx = cCtx as unknown as VendorPrefixedContext2D;
    vendorCtx.mozImageSmoothingEnabled = false;
    vendorCtx.webkitImageSmoothingEnabled = false;
    vendorCtx.msImageSmoothingEnabled = false;

    cCtx.drawImage(off, 0, 0, w, h, 0, 0, width, height);
    cCtx.restore();
  }
}
