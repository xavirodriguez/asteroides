import { Renderer, RenderContext } from "./Renderer";
import { ComponentRegistry } from "../ecs/Component";

/**
 * Callback function for registering renderer elements.
 * @public
 */
export type RendererRegistrationCallback = (renderer: Renderer<ComponentRegistry, RenderContext>) => void;

/**
 * Configuration for registration callbacks across different rendering pipelines.
 * @public
 */
export interface RendererRegistrationConfig {
  canvas?: RendererRegistrationCallback;
  skia?: RendererRegistrationCallback;
}

/**
 * Utility functions for managing different rendering implementations.
 * @public
 */
export class RendererUtils {
  /**
   * Registra assets, formas y efectos basándose en el tipo de renderizador activo.
   * Elimina la necesidad de hacer branching (if/else) y casteo manual (as any)
   * en las clases de los juegos.
   */
  public static registerAssets<T extends ComponentRegistry>(
    renderer: Renderer<T, RenderContext>,
    config: RendererRegistrationConfig
  ): void {
    const rendererType = (renderer as unknown as { type?: string }).type;

    if (rendererType === "canvas" && config.canvas) {
      config.canvas(renderer);
    } else if (rendererType === "skia" && config.skia) {
      config.skia(renderer);
    } else if (!rendererType) {
      console.warn("[RendererUtils] No se pudo determinar el tipo de renderizador (missing 'type' property).");
    }
  }
}
