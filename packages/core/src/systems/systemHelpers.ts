import { World } from "../ecs/World";
import { CoreComponentRegistry, RunState } from "../ecs/CoreComponents";
import { EventBus } from "../events/EventBus";
import { Entity } from "../ecs/Entity";

/**
 * Context object returned by `getGameplaySystemContext`.
 * @public
 */
export interface GameplaySystemContext {
  runState: RunState | undefined;
  eventBus: EventBus | undefined;
}

/**
 * Helper to retrieve common gameplay system context (RunState, EventBus)
 * while checking if simulation is currently paused.
 *
 * @returns `null` if the world is paused, or `{ runState, eventBus }`.
 * @public
 */
export function getGameplaySystemContext<TRegistry extends CoreComponentRegistry = CoreComponentRegistry>(
  world: World<TRegistry>
): GameplaySystemContext | null {
  if (world.getResource("IsPaused") === true) return null;
  const runState = world.getResource<RunState>("RunState");
  const eventBus = world.getEventBus();
  return { runState, eventBus };
}

/**
 * Helper to retrieve common gameplay system context and query primary target entities
 * while maintaining strict pause checks.
 *
 * @returns `null` if the world is paused, or `{ runState, eventBus, entities }`.
 * @public
 */
export function getGameplaySystemContextAndEntities<
  TRegistry extends CoreComponentRegistry = CoreComponentRegistry
>(
  world: World<TRegistry>,
  ...componentTypes: Array<Extract<keyof TRegistry, string>>
): (GameplaySystemContext & { entities: ReadonlyArray<Entity> }) | null {
  const ctx = getGameplaySystemContext(world);
  if (!ctx) return null;
  const entities = componentTypes.length > 0 ? world.query(...componentTypes) : [];
  return { ...ctx, entities };
}
