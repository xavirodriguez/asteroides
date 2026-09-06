import { System, World, CoreComponentRegistry } from "@tiny-aster/core";
import { PowerUpComponent } from "../types/ArcadeTypes";
import { PowerUpRegistry, IPowerUpEffect } from "../powerups/PowerUpRegistry";

const __DEV__ = typeof process !== "undefined" && process.env?.NODE_ENV !== "production";

/** @public */
export class PowerUpSystem extends System<CoreComponentRegistry & { PowerUp: PowerUpComponent }> {
  public update(world: World<CoreComponentRegistry & { PowerUp: PowerUpComponent }>, _deltaTime: number): void {
    if (world.getResource("IsPaused") === true) return;
    const powerUpType = "PowerUp" as Extract<keyof (CoreComponentRegistry & { PowerUp: PowerUpComponent }), string>;
    const collisionType = "CollisionEvents" as Extract<keyof (CoreComponentRegistry & { PowerUp: PowerUpComponent }), string>;
    const entities = world.query(powerUpType, collisionType);

    const registryResource = world.getResource<PowerUpRegistry | Record<string, IPowerUpEffect>>("PowerUpEffects")
      || world.getResource<PowerUpRegistry>("PowerUpRegistry");

    for (const entity of entities) {
      const powerUp = world.getComponent(entity, powerUpType) as PowerUpComponent | undefined;
      const collisionsComp = world.getComponent(entity, collisionType) as CoreComponentRegistry["CollisionEvents"] | undefined;

      if (!powerUp || !collisionsComp || !collisionsComp.collisions) continue;

      for (const col of collisionsComp.collisions) {
        const other = col.otherEntity;

        // Check if other is player
        const isPlayer = world.hasComponent(other, "LocalPlayer" as Extract<keyof CoreComponentRegistry, string>) ||
                         world.hasComponent(other, "RemotePlayer" as Extract<keyof CoreComponentRegistry, string>) ||
                         world.hasComponent(other, "Player" as Extract<keyof CoreComponentRegistry, string>);

        if (isPlayer) {
          let effect: IPowerUpEffect | undefined;

          if (registryResource) {
            if (registryResource instanceof PowerUpRegistry) {
              effect = registryResource.get(powerUp.powerUpType);
            } else if (typeof (registryResource as { get?: (type: string) => IPowerUpEffect | undefined }).get === "function") {
              effect = (registryResource as { get?: (type: string) => IPowerUpEffect | undefined }).get!(powerUp.powerUpType);
            } else {
              effect = (registryResource as Record<string, IPowerUpEffect>)[powerUp.powerUpType];
            }
          }

          if (effect && typeof effect.apply === "function") {
            effect.apply(world, other);
          } else {
            if (__DEV__) {
              console.warn(`[PowerUpSystem] No power-up effect registered for type: '${powerUp.powerUpType}'`);
            }
          }

          // Destroy power-up entity
          world.getCommandBuffer().removeEntity(entity);
          break; // stop processing further collisions for this power-up
        }
      }
    }
  }
}
