import { World } from "../ecs/World";
import { Entity } from "../ecs/Entity";
import { PlayerSensorComponent, TransformComponent } from "../ecs/CoreComponents";

/**
 * Checks if a player sensor has detected a player entity and returns "Alert" state transition if so.
 *
 * @param sensor - The player sensor component to evaluate.
 * @returns "Alert" if a player is detected; otherwise undefined.
 * @public
 */
export function checkPlayerDetectionToAlert(
  sensor?: PlayerSensorComponent
): "Alert" | undefined {
  if (sensor && sensor.detectedPlayerEntity !== undefined) {
    return "Alert";
  }
  return undefined;
}

/**
 * Safely zeros out horizontal velocity for an entity if velocity component exists and vx is non-zero.
 *
 * @remarks
 * Uses value-gated `getMutableComponent` instead of `mutateComponent` to avoid per-call closure allocations
 * and prevent unnecessary `stateVersion` increments when velocity is already zero.
 *
 * @param world - The ECS World simulation container.
 * @param entity - The target entity.
 * @public
 */
export function zeroOutVelocityX(world: World, entity: Entity): void {
  const vel = world.getComponent(entity, "Velocity");
  if (vel && vel.vx !== 0) {
    const mutableVel = world.getMutableComponent(entity, "Velocity");
    if (mutableVel) {
      mutableVel.vx = 0;
    }
  }
}

/**
 * Pure state definition factory for zeroing horizontal velocity on enter.
 * @public
 */
export function zeroVelocityXOnEnter(): {
  onEnter: (world: World, entity: Entity, data: Record<string, unknown>) => void;
} {
  return {
    onEnter(world: World, entity: Entity, _data: Record<string, unknown>): void {
      zeroOutVelocityX(world, entity);
    }
  };
}

/**
 * Pure state definition factory for transitioning to the next state after elapsed time.
 * @public
 */
export function timedTransition(
  durationKey: string,
  nextState: string
): {
  onUpdate: (
    world: World,
    entity: Entity,
    data: Record<string, unknown>,
    elapsed: number
  ) => string | undefined;
} {
  return {
    onUpdate(_world: World, _entity: Entity, data: Record<string, unknown>, elapsed: number): string | undefined {
      const dur = (data[durationKey] as number) ?? 0.5;
      if (elapsed >= dur) {
        return nextState;
      }
      return undefined;
    }
  };
}

/**
 * Calculates the horizontal direction multiplier (-1 or 1) towards the detected player entity.
 *
 * @param world - The ECS World simulation container.
 * @param entity - The enemy entity.
 * @param sensor - Optional player sensor component.
 * @param trans - Optional transform component of the enemy.
 * @returns 1 if player is to the right or undetected; -1 if player is to the left.
 * @public
 */
export function getHorizontalDirectionToPlayer(
  world: World,
  _entity: Entity,
  sensor?: PlayerSensorComponent,
  trans?: TransformComponent
): number {
  if (sensor && sensor.detectedPlayerEntity !== undefined && trans) {
    const playerTrans = world.getComponent(sensor.detectedPlayerEntity, "Transform");
    if (playerTrans) {
      return playerTrans.x > trans.x ? 1 : -1;
    }
  }
  return 1;
}

/**
 * Computes a normalized 2D direction vector towards the detected player entity.
 *
 * @param world - The ECS World simulation container.
 * @param entity - The enemy entity.
 * @param sensor - Optional player sensor component.
 * @param trans - Optional transform component of the enemy.
 * @returns Normalized direction vector `{ x, y }` or `null` if no player detected or missing transform.
 * @public
 */
export function getDirectionToDetectedPlayer(
  world: World,
  _entity: Entity,
  sensor?: PlayerSensorComponent,
  trans?: TransformComponent
): { x: number; y: number } | null {
  if (!sensor || sensor.detectedPlayerEntity === undefined || !trans) {
    return null;
  }

  const playerTrans = world.getComponent(sensor.detectedPlayerEntity, "Transform");
  if (!playerTrans) return null;

  const dx = (playerTrans.worldX ?? playerTrans.x) - (trans.worldX ?? trans.x);
  const dy = (playerTrans.worldY ?? playerTrans.y) - (trans.worldY ?? trans.y);
  const dist = Math.hypot(dx, dy);

  if (dist === 0) return { x: 0, y: 0 };
  return { x: dx / dist, y: dy / dist };
}
