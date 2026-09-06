import { World } from "../ecs/World";

/**
 * Common mixin/helper for gameplay freeze management on an ECS World instance.
 * @public
 */
export function enterGameplayFreeze(world: World, duration?: number): void {
  world.setResource("GameplayFreeze", {
    remaining: duration !== undefined ? duration : undefined
  });
}

/**
 * Exits soft pause / gameplay freeze state, deleting the `GameplayFreeze` world resource.
 * @public
 */
export function exitGameplayFreeze(world: World): void {
  world.deleteResource("GameplayFreeze");
}

/**
 * Returns whether gameplay simulation is currently frozen on the world.
 * @public
 */
export function isGameplayFrozen(world: World): boolean {
  return world.getResource("GameplayFreeze") !== undefined;
}

/**
 * Returns remaining gameplay freeze duration in seconds, or `undefined` if not frozen or infinite.
 * @public
 */
export function getGameplayFreezeRemaining(world: World): number | undefined {
  const freeze = world.getResource<{ remaining?: number }>("GameplayFreeze");
  return freeze ? freeze.remaining : undefined;
}
