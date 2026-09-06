import { World } from "../ecs/World";
import { ComponentRegistry } from "../ecs/Component";

/**
 * RenderContext represents the basic rendering target contexts.
 * @public
 */
/**
 * RenderContext represents the basic rendering target contexts (Canvas2D or custom renderer contexts).
 * @public
 */
export type RenderContext = CanvasRenderingContext2D & Record<string, unknown>;

/**
 * Interface for a generic renderer that can visualize the state of an ECS world.
 *
 * @typeParam TRegistry - The component registry used by the world.
 * @typeParam TContext - The specific rendering context (e.g., CanvasRenderingContext2D, Skia Canvas).
 * @public
 */
export interface Renderer<TRegistry extends ComponentRegistry = ComponentRegistry, TContext = RenderContext> {
  readonly type: string;
  /**
   * Renders the current state of the world.
   * @param world - The ECS world to render.
   * @param ctx - The rendering context.
   * @param interpolation - Optional interpolation factor for smooth rendering between fixed timesteps.
   */
  render(world: World<TRegistry>, ctx: TContext, interpolation?: number): void;

  registerShape(name: string, drawer: ShapeDrawer<RenderContext, TRegistry>): void;
  registerBackgroundEffect(name: string, drawer: EffectDrawer<RenderContext, TRegistry>): void;
}

/**
 * Interface for drawing individual shapes or entities.
 * @public
 */
export interface ShapeDrawer<TContext = RenderContext, TRegistry extends ComponentRegistry = ComponentRegistry> {
  /**
   * Draws a specific entity to the context.
   * @param context - The rendering context.
   * @param world - The ECS world.
   * @param entity - The entity to draw.
   */
  draw(context: TContext, world: World<TRegistry>, entity: number): void;
}

/**
 * Interface for drawing global screen effects.
 * @public
 */
export interface EffectDrawer<TContext = RenderContext, TRegistry extends ComponentRegistry = ComponentRegistry> {
  /**
   * Draws effects to the context.
   * @param context - The rendering context.
   * @param world - The ECS world.
   */
  draw(context: TContext, world: World<TRegistry>): void;
}
