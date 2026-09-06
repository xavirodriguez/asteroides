import { World } from "../ecs/World";
import { System } from "../ecs/System";
import { ComponentRegistry } from "../ecs/Component";
import { CoreComponentRegistry, TransformComponent, VelocityComponent } from "../ecs/CoreComponents";
import { Entity } from "../ecs/Entity";
import { SteeringComponent } from "./SteeringComponent";
import { FactionComponent } from "./FactionComponent";

/**
 * System that calculates steering forces (Seek/Flee) and applies them to Velocity.
 * @public
 */
export class SteeringSystem<
  TRegistry extends ComponentRegistry = CoreComponentRegistry
> extends System<TRegistry> {
  public update(world: World<TRegistry>, deltaTime: number): void {
    if (world.getResource("IsPaused") === true) return;
    if (deltaTime <= 0) return;

    const steeringType = "Steering" as Extract<keyof TRegistry, string>;
    const transformType = "Transform" as Extract<keyof TRegistry, string>;
    const velocityType = "Velocity" as Extract<keyof TRegistry, string>;

    const entities = world.query(steeringType, transformType, velocityType);

    for (const entity of entities) {
      const steering = world.getComponent(entity, steeringType) as unknown as SteeringComponent | undefined;
      if (!steering) continue;

      const currentT = world.getComponent(entity, transformType) as unknown as TransformComponent | undefined;
      if (!currentT) continue;

      let targetX = 0;
      let targetY = 0;
      let targetFound = false;

      // 1. Resolve target entity
      if (steering.targetFaction) {
        const factionType = "Faction" as Extract<keyof TRegistry, string>;
        const factionEntities = world.query(factionType, transformType);
        let closestEntity: Entity | undefined = undefined;
        let minDistanceSq = Infinity;

        for (const potentialTarget of factionEntities) {
          if (potentialTarget === entity) continue;

          const factionComp = world.getComponent(potentialTarget, factionType) as unknown as FactionComponent | undefined;
          if (!factionComp || factionComp.value !== steering.targetFaction) continue;

          const targetT = world.getComponent(potentialTarget, transformType) as unknown as TransformComponent | undefined;
          if (!targetT) continue;

          const dx = targetT.x - currentT.x;
          const dy = targetT.y - currentT.y;
          const distSq = dx * dx + dy * dy;

          if (distSq < minDistanceSq) {
            minDistanceSq = distSq;
            closestEntity = potentialTarget;
          } else if (distSq === minDistanceSq) {
            if (closestEntity === undefined || potentialTarget < closestEntity) {
              closestEntity = potentialTarget;
            }
          }
        }

        if (closestEntity !== undefined) {
          if (steering.targetEntity !== closestEntity) {
            world.mutateComponent(entity, steeringType, (s) => {
              (s as unknown as SteeringComponent).targetEntity = closestEntity;
            });
          }
          const targetT = world.getComponent(closestEntity, transformType) as unknown as TransformComponent | undefined;
          if (targetT) {
            targetX = targetT.x;
            targetY = targetT.y;
            targetFound = true;
          }
        } else {
          if (steering.targetEntity !== undefined) {
            world.mutateComponent(entity, steeringType, (s) => {
              (s as unknown as SteeringComponent).targetEntity = undefined;
            });
          }
        }
      } else if (steering.targetEntity !== undefined) {
        if (world.hasEntity(steering.targetEntity)) {
          const targetT = world.getComponent(steering.targetEntity, transformType) as unknown as TransformComponent | undefined;
          if (targetT) {
            targetX = targetT.x;
            targetY = targetT.y;
            targetFound = true;
          }
        } else {
          // Explicit target was destroyed, clean it up
          world.mutateComponent(entity, steeringType, (s) => {
            (s as unknown as SteeringComponent).targetEntity = undefined;
          });
        }
      }

      // 2. Apply steering mechanics
      if (!targetFound) {
        // No target → do not move
        world.mutateComponent(entity, velocityType, (v) => {
          const vel = v as unknown as VelocityComponent;
          vel.vx = 0;
          vel.vy = 0;
        });
        continue;
      }

      const currentV = world.getComponent(entity, velocityType) as unknown as VelocityComponent | undefined;
      if (!currentV) continue;

      const maxSpeed = steering.maxSpeed;
      const maxAcceleration = steering.maxAcceleration;

      // Desired velocity vector
      let desiredVx = targetX - currentT.x;
      let desiredVy = targetY - currentT.y;

      if (steering.mode === "flee") {
        desiredVx = currentT.x - targetX;
        desiredVy = currentT.y - targetY;
      }

      const distance = Math.sqrt(desiredVx * desiredVx + desiredVy * desiredVy);

      if (distance > 0) {
        let speed = maxSpeed;

        // Arrival radius mechanics for seek mode
        if (steering.mode === "seek" && steering.arrivalRadius !== undefined && steering.arrivalRadius > 0) {
          if (distance < steering.arrivalRadius) {
            speed = maxSpeed * (distance / steering.arrivalRadius);
          }
        }

        desiredVx = (desiredVx / distance) * speed;
        desiredVy = (desiredVy / distance) * speed;
      } else {
        desiredVx = 0;
        desiredVy = 0;
      }

      // Calculate steering force (desired - current)
      let forceX = desiredVx - currentV.vx;
      let forceY = desiredVy - currentV.vy;

      // Limit force to maxAcceleration
      const forceLength = Math.sqrt(forceX * forceX + forceY * forceY);
      if (forceLength > maxAcceleration && forceLength > 0) {
        forceX = (forceX / forceLength) * maxAcceleration;
        forceY = (forceY / forceLength) * maxAcceleration;
      }

      // Mutate velocity
      world.mutateComponent(entity, velocityType, (v) => {
        const vel = v as unknown as VelocityComponent;
        vel.vx += forceX * deltaTime;
        vel.vy += forceY * deltaTime;

        // Cap final velocity to maxSpeed
        const speed = Math.sqrt(vel.vx * vel.vx + vel.vy * vel.vy);
        if (speed > maxSpeed && speed > 0) {
          vel.vx = (vel.vx / speed) * maxSpeed;
          vel.vy = (vel.vy / speed) * maxSpeed;
        }
      });
    }
  }
}
