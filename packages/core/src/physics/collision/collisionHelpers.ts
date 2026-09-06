import { World } from "../../ecs/World";
import { Entity } from "../../ecs/Entity";
import { CollisionEventsComponent } from "../../ecs/CoreComponents";
import { ComponentRegistry } from "../../ecs/Component";

/**
 * Searches through `activeTriggers` and `collisions` on the target entity's `CollisionEvents` component
 * for an entity matching the predicate.
 *
 * @param world - Simulation world.
 * @param entity - Entity with potential CollisionEvents component.
 * @param predicate - Function evaluating candidate entities.
 * @returns Matched entity if found, otherwise `null`.
 *
 * @public
 */
export function findMatchingEntityInTriggersOrCollisions<TComponents extends ComponentRegistry>(
  world: World<TComponents>,
  entity: Entity,
  predicate: (other: Entity) => boolean
): Entity | null {
  const events = world.getComponent(entity, "CollisionEvents" as Extract<keyof TComponents, string>) as CollisionEventsComponent | undefined;
  if (!events) return null;

  if (events.activeTriggers) {
    const triggers = events.activeTriggers;
    for (let i = 0; i < triggers.length; i++) {
      const other = triggers[i];
      if (predicate(other)) {
        return other;
      }
    }
  }

  if (events.collisions) {
    const cols = events.collisions;
    for (let i = 0; i < cols.length; i++) {
      const other = cols[i].otherEntity;
      if (predicate(other)) {
        return other;
      }
    }
  }

  return null;
}

/**
 * Finds which player entity triggered an interaction with a target entity,
 * checking both target-side triggers/collisions and player-side triggers/collisions.
 *
 * Preserves single-player fast path and trigger-before-collision evaluation order.
 *
 * @public
 */
export function findTriggeringPlayer<TComponents extends ComponentRegistry>(
  world: World<TComponents>,
  targetEntity: Entity,
  players: ReadonlyArray<Entity>
): Entity | null {
  if (players.length === 0) return null;

  const singlePlayer = players.length === 1 ? players[0] : null;
  const isPlayer = (other: Entity) => (singlePlayer !== null ? other === singlePlayer : players.indexOf(other) !== -1);

  // 1. Check if target entity has CollisionEvents pointing to a player
  let triggeredBy = findMatchingEntityInTriggersOrCollisions(world, targetEntity, isPlayer);

  // 2. Check if players have CollisionEvents pointing to target entity
  if (!triggeredBy) {
    for (let p = 0; p < players.length; p++) {
      const playerEntity = players[p];
      const found = findMatchingEntityInTriggersOrCollisions(world, playerEntity, (other) => other === targetEntity);
      if (found !== null) {
        triggeredBy = playerEntity;
        break;
      }
    }
  }

  return triggeredBy;
}
