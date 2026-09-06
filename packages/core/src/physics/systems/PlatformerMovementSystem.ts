import { World } from "../../ecs/World";
import { System } from "../../ecs/System";
import { ComponentRegistry } from "../../ecs/Component";
import { CoreComponentRegistry, PlatformerInputComponent, PlatformerMovementConfigComponent, VelocityComponent, PlatformerGroundStateComponent } from "../../ecs/CoreComponents";
import { Entity } from "../../ecs/Entity";

/**
 * System that handles platformer horizontal movement with acceleration and deceleration.
 *
 * @remarks
 * Dynamically switches between grounded acceleration/deceleration and airborne
 * airAcceleration/airDeceleration values based on the entity's PlatformerGroundState.
 * @public
 */
export class PlatformerMovementSystem<TRegistry extends ComponentRegistry = CoreComponentRegistry> extends System<TRegistry> {
  /**
   * Processes horizontal platformer movement acceleration and deceleration for active entities.
   *
   * @param world - Simulation world instance.
   * @param deltaTime - Elapsed frame duration in seconds.
   *
   * @sideEffect Mutates `Velocity` components on active platformer entities.
   */
  public update(world: World<TRegistry>, deltaTime: number): void {
    if (world.getResource("IsPaused") === true) return;
    const inputType = "PlatformerInput" as Extract<keyof TRegistry, string>;
    const configType = "PlatformerMovementConfig" as Extract<keyof TRegistry, string>;
    const velocityType = "Velocity" as Extract<keyof TRegistry, string>;
    const groundStateType = "PlatformerGroundState" as Extract<keyof TRegistry, string>;

    const entities = world.query(inputType, configType, velocityType);

    for (const entity of entities) {
      const input = world.getComponent(entity, inputType) as unknown as PlatformerInputComponent | undefined;
      const config = world.getComponent(entity, configType) as unknown as PlatformerMovementConfigComponent | undefined;
      const vel = world.getComponent(entity, velocityType) as unknown as VelocityComponent | undefined;
      const groundState = world.hasComponent(entity, groundStateType)
        ? (world.getComponent(entity, groundStateType) as unknown as PlatformerGroundStateComponent | undefined)
        : null;

      if (!input || !config || !vel) continue;

      const isGrounded = groundState ? groundState.isGrounded : false;
      const iceMultiplier = groundState && groundState.iceMultiplier !== undefined ? groundState.iceMultiplier : 1;

      const accel = isGrounded ? config.acceleration : config.airAcceleration;
      const decel = isGrounded ? config.deceleration : config.airDeceleration;

      const effectiveAccel = accel * iceMultiplier;
      const effectiveDecel = decel * iceMultiplier;

      const targetSpeed = input.moveDir * config.maxSpeed;

      world.mutateComponent(entity, velocityType, (v) => {
        const mutableVel = v as unknown as VelocityComponent;
        if (input.moveDir !== 0) {
          mutableVel.vx = this.moveTowards(mutableVel.vx, targetSpeed, effectiveAccel * deltaTime);
        } else {
          mutableVel.vx = this.moveTowards(mutableVel.vx, 0, effectiveDecel * deltaTime);
        }
      });
    }
  }

  private moveTowards(current: number, target: number, maxDelta: number): number {
    if (Math.abs(target - current) <= maxDelta) {
      return target;
    }
    return current + Math.sign(target - current) * maxDelta;
  }
}
