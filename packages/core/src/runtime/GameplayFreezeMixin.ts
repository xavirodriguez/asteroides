import { World } from "../ecs/World";
import { ComponentRegistry } from "../ecs/Component";

/**
 * Common mixin/helper for gameplay freeze management on an ECS World instance.
 * @public
 */
export function enterGameplayFreeze<TComponents extends ComponentRegistry = ComponentRegistry>(world: World<TComponents>, duration?: number): void {
  world.setResource("GameplayFreeze", {
    remaining: duration !== undefined ? duration : undefined
  });
}

/**
 * Exits soft pause / gameplay freeze state, deleting the `GameplayFreeze` world resource.
 * @public
 */
export function exitGameplayFreeze<TComponents extends ComponentRegistry = ComponentRegistry>(world: World<TComponents>): void {
  world.deleteResource("GameplayFreeze");
}

/**
 * Returns whether gameplay simulation is currently frozen on the world.
 * @public
 */
export function isGameplayFrozen<TComponents extends ComponentRegistry = ComponentRegistry>(world: World<TComponents>): boolean {
  return world.getResource("GameplayFreeze") !== undefined;
}

/**
 * Returns remaining gameplay freeze duration in seconds, or `undefined` if not frozen or infinite.
 * @public
 */
export function getGameplayFreezeRemaining<TComponents extends ComponentRegistry = ComponentRegistry>(world: World<TComponents>): number | undefined {
  const freeze = world.getResource<{ remaining?: number }>("GameplayFreeze");
  return freeze ? freeze.remaining : undefined;
}
