import { RenderContext } from "../rendering/Renderer";

/**
 * Signature for transition easing functions.
 * @public
 */
export type EasingFunction = (t: number) => number;

/**
 * Configuration options for scene transitions.
 * @public
 */
export interface TransitionOptions {
  /**
   * Timeout for transition loading/onEnter phase in milliseconds.
   */
  timeout?: number;

  /**
   * Visual transition duration in milliseconds.
   * Defaults to 300ms.
   */
  duration?: number;

  /**
   * Easing function or string name of built-in easing to use for interpolation.
   * Defaults to 'linear'.
   */
  easing?: EasingFunction | string;

  /**
   * Name of the transition effect or a direct effect instance.
   * Defaults to 'fade'.
   */
  effect?: string | ITransitionEffect;

  /**
   * Color for color-based transitions (e.g. fade, iris).
   * Defaults to '#000000'.
   */
  color?: string;

  /** Center X position for radial/iris transitions. */
  centerX?: number;

  /** Center Y position for radial/iris transitions. */
  centerY?: number;

  /** Offscreen canvas for two-scene transitions. */
  offscreenCanvas?: CanvasImageSource | HTMLCanvasElement;

  /** Pulse frequency for pulse transitions. */
  frequency?: number;

  /** Pixel/block size for dither and pixelate transitions. */
  blockSize?: number;

  /** Maximum pixel size for pixelate transition. */
  maxPixelSize?: number;

  /** Direction for sweep/curtain transitions. */
  direction?: string;

  /** Angle in radians for diagonal transitions. */
  angle?: number;

  /** Intensity scaling for glitch or shake transitions. */
  intensity?: number;

  /** Height of horizontal slices for CRT glitch transition. */
  sliceHeight?: number;

  /** Line thickness for scanline transitions. */
  lineThickness?: number;

  /** Line color for scanline wipe transitions. */
  lineColor?: string;

  /** Line width for scanline wipe transitions. */
  lineWidth?: number;

  /**
   * Extra configuration options for specific transitions.
   */
  [key: string]: unknown;
}

/**
 * Contract representing a custom transition effect.
 * @public
 */
export interface ITransitionEffect {
  /**
   * Indicates whether the transition requires rendering both old and new scenes simultaneously.
   */
  drawsBothScenes?: boolean;

  /**
   * Renders the transition effect on top of the rendered frame.
   * @param ctx - The render context (e.g. CanvasRenderingContext2D).
   * @param progress - Normalized progress of the overall transition, from 0.0 (start) to 1.0 (end).
   * @param options - Configured transition options.
   */
  render(ctx: RenderContext, progress: number, options?: TransitionOptions): void;
}

/**
 * Dictionary of standard built-in easing functions.
 * @public
 */
export const EASING_FUNCTIONS: Record<string, EasingFunction> = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => t * (2 - t),
  easeInOut: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
};

/**
 * Helper to resolve an easing function from a string or function option.
 * @param easingOption - String key or custom EasingFunction.
 * @returns Resolved EasingFunction.
 * @public
 */
export function getEasingFunction(easingOption?: EasingFunction | string): EasingFunction {
  if (typeof easingOption === "function") {
    return easingOption;
  }
  if (typeof easingOption === "string" && EASING_FUNCTIONS[easingOption]) {
    return EASING_FUNCTIONS[easingOption];
  }
  return EASING_FUNCTIONS.linear;
}
