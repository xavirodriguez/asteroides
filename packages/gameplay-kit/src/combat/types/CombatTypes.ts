import { Entity } from "@tiny-aster/core";

/**
 * Payload for the 'combat:hit' deferred event.
 * @public
 */
export interface CombatHitEvent {
  targetEntity: Entity;
  sourceEntity?: Entity;
  amount: number;
  remainingHealth: number;
  category?: string;
}

/**
 * Payload for the 'combat:death' deferred event.
 * @public
 */
export interface CombatDeathEvent {
  entity: Entity;
  sourceEntity?: Entity;
  category?: string;
}
