import {
  EntityBuilder,
  HealthComponent,
  CoreComponentRegistry,
  BlueprintRegistry,
  World
} from "@tiny-aster/core";

/**
 * Registers platformer enemy blueprints (`enemy_sentinel`, `enemy_hopper`, `enemy_charger`)
 * on the provided blueprint registry.
 *
 * @public
 */
export function registerPlatformerEnemyBlueprints(
  blueprints: BlueprintRegistry<CoreComponentRegistry, any, any>
): void {
  // TODO(refactor): código duplicado detectado (bloque) con shared/arcade/blueprints/enemyBlueprints.ts:42-47. Considerar extraer a función compartida. Ref: 2db0801e
  blueprints.register("enemy_sentinel", {
    spawn: (world: World<CoreComponentRegistry>, entity: number, args: { x: number; y: number }) => {
      EntityBuilder.fromEntity(world, entity)
        .withTransform({ x: args.x, y: args.y })
        .withVelocity()
        .withRender({ shape: "sentinel", size: 22, order: 2 });

      world.addComponent(entity, { type: "Health", current: 1, max: 1 } as HealthComponent);
      world.addComponent(entity, { type: "Enemy", kind: "patrol" } as { type: string; [key: string]: unknown });
      world.addComponent(entity, { type: "Patrol", startX: args.x - 80, endX: args.x + 80, direction: 1, patrolSpeed: 70 } as { type: string; [key: string]: unknown });
      world.addComponent(entity, { type: "GroundDetector", hasGroundAhead: true, hasWallAhead: false, sensorOffsetX: 15, sensorOffsetY: 20 } as { type: string; [key: string]: unknown });
      world.addComponent(entity, { type: "PlayerSensor", visionRange: 130, detectedPlayerEntity: undefined } as { type: string; [key: string]: unknown });
      world.addComponent(entity, {
        type: "StateMachine",
        currentState: "Patrol",
        elapsedInState: 0,
        data: { patrolSpeed: 70, alertDuration: 0.3, windupDuration: 0.3, attackDuration: 0.4, recoveryDuration: 0.5 },
        machineId: "patrol",
        elapsedMs: 0
      } as { type: string; [key: string]: unknown });
      // TODO(refactor): código duplicado detectado (bloque) con shared/arcade/blueprints/enemyBlueprints.ts:59-66. Considerar extraer a función compartida. Ref: 842975b2
      world.addComponent(entity, { type: "Hurtbox" } as { type: string; [key: string]: unknown });
    }
  });

  // TODO(refactor): código duplicado detectado (bloque) con shared/arcade/blueprints/enemyBlueprints.ts:19-24. Considerar extraer a función compartida. Ref: 6ab1c6b0
  blueprints.register("enemy_hopper", {
    spawn: (world: World<CoreComponentRegistry>, entity: number, args: { x: number; y: number }) => {
      EntityBuilder.fromEntity(world, entity)
        .withTransform({ x: args.x, y: args.y })
        .withVelocity()
        .withRender({ shape: "hopper", size: 24, order: 2 });

      world.addComponent(entity, { type: "Health", current: 1, max: 1 } as HealthComponent);
      world.addComponent(entity, { type: "Enemy", kind: "jumper" } as { type: string; [key: string]: unknown });
      world.addComponent(entity, { type: "PlayerSensor", visionRange: 150, detectedPlayerEntity: undefined } as { type: string; [key: string]: unknown });
      world.addComponent(entity, { type: "PlatformerGroundState", isGrounded: false } as { type: string; [key: string]: unknown });
      world.addComponent(entity, {
        type: "StateMachine",
        currentState: "Idle",
        elapsedInState: 0,
        data: { idleDuration: 0.8, alertDuration: 0.3, windupDuration: 0.3, jumpVelocity: 260, patrolSpeed: 60, attackDuration: 0.8, recoveryDuration: 0.4 },
        machineId: "jumper",
        elapsedMs: 0
      } as { type: string; [key: string]: unknown });
      world.addComponent(entity, { type: "Hurtbox" } as { type: string; [key: string]: unknown });
    }
  });

  blueprints.register("enemy_charger", {
    spawn: (world: World<CoreComponentRegistry>, entity: number, args: { x: number; y: number }) => {
      EntityBuilder.fromEntity(world, entity)
        .withTransform({ x: args.x, y: args.y })
        .withVelocity()
        .withRender({ shape: "charger", size: 28, order: 2 });

      world.addComponent(entity, { type: "Health", current: 1, max: 1 } as HealthComponent);
      world.addComponent(entity, { type: "Enemy", kind: "charger" } as { type: string; [key: string]: unknown });
      world.addComponent(entity, { type: "PlayerSensor", visionRange: 160, detectedPlayerEntity: undefined } as { type: string; [key: string]: unknown });
      world.addComponent(entity, { type: "GroundDetector", hasGroundAhead: true, hasWallAhead: false, sensorOffsetX: 15, sensorOffsetY: 20 } as { type: string; [key: string]: unknown });
      world.addComponent(entity, {
        type: "StateMachine",
        currentState: "Idle",
        elapsedInState: 0,
        data: { alertDuration: 0.4, windupDuration: 0.4, chargeSpeed: 200, attackDuration: 1.0, recoveryDuration: 0.8 },
        machineId: "charger",
        elapsedMs: 0
      } as { type: string; [key: string]: unknown });
      // TODO(refactor): código duplicado detectado (bloque) con shared/arcade/blueprints/enemyBlueprints.ts:35-40. Considerar extraer a función compartida. Ref: db3852a9
      world.addComponent(entity, { type: "Hurtbox" } as { type: string; [key: string]: unknown });
    }
  });
}
