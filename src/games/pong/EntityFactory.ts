import { World, spawnBlueprintEntity } from "@tiny-aster/core";
import { PongConfig, DEFAULT_PONG_CONFIG } from "./types/PongConfigSchema";
import { TransformComponent, VelocityComponent, ColliderComponent } from "@tiny-aster/core";

import { CollisionLayers } from "@tiny-aster/gameplay-kit";

/**
 * Factoría para la creación de entidades de Pong.
 *
 * @responsibility Instanciar la bola, las paletas y el estado global con los componentes correctos.
 *
 * @remarks
 * Encapsula la configuración de dimensiones, velocidades iniciales y máscaras de colisión
 * necesarias para el comportamiento de rebote característico de Pong.
 */
export const PongEntityFactory = {
  /**
   * Creates the ball entity at the center of the screen.
   * Uses `gameplayRandom` to determine initial vertical direction.
   */
  createBall(world: World<any>) {
    return spawnBlueprintEntity(world, "ball", {});
  },

  /**
   * Creates a paddle entity for either the left or right side.
   * @param world - ECS World.
   * @param side - Which side of the screen the paddle belongs to.
   */
  createPaddle(world: World<any>, side: "left" | "right") {
    return spawnBlueprintEntity(world, "paddle", { side });
  },

  createGameState(world: World<any>) {
    return spawnBlueprintEntity(world, "state", {});
  }
};
