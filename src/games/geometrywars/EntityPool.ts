import {
  World,
  Entity,
  TransformComponent,
  VelocityComponent,
  RenderComponent,
  ColliderComponent,
  CollisionEventsComponent,
  ReclaimableComponent,
  ShapeType,
  CircleShape,
  ProjectilePool,
  ProjectileParams
} from "@tiny-aster/core";
import { CollisionLayers } from "@tiny-aster/gameplay-kit";
import { colors } from "../../theme/colors";
import { DamageComponent, FactionComponent } from "@tiny-aster/gameplay-kit";
import { SharedParticlePool } from "@tiny-aster/gameplay-kit";

/**
 * Standardized GWBulletPool for Geometry Wars.
 * Extends the engine's ProjectilePool to leverage high-performance entity reuse.
 * @public
 */
export class GWBulletPool extends ProjectilePool<any, ProjectileParams> {
  constructor() {
    // TODO(refactor): código duplicado detectado (bloque) con shared/arcade/ParticlePool.ts:32-56. Considerar extraer a función compartida. Ref: 6c6321d0
    super({
      factory: () => ({
        position: {
          type: "Transform",
          x: 0,
          y: 0,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          worldX: 0,
          worldY: 0,
          worldRotation: 0,
          worldScaleX: 1,
          worldScaleY: 1,
          dirty: false
        } as TransformComponent,
        velocity: {
          type: "Velocity",
          vx: 0,
          vy: 0,
          angularVelocity: 0
        } as VelocityComponent,
        render: {
          type: "Render",
          shape: "gw_bullet",
          size: 4,
          color: colors.gold,
          rotation: 0,
          visible: true,
          opacity: 1,
          order: 2,
          hitFlashFrames: 0,
          angularVelocity: 0
        } as RenderComponent,
        collider: {
          type: "Collider",
          shape: { type: ShapeType.Circle, radius: 2 } as CircleShape,
          layer: CollisionLayers.PROJECTILE,
          mask: CollisionLayers.ENEMY,
          offsetX: 0,
          offsetY: 0,
          isTrigger: true,
          enabled: true
        } as ColliderComponent,
        ttl: {
          type: "TTL",
          remaining: 0,
          timeLeft: 0
        },
        reclaimable: {
          type: "Reclaimable",
          poolId: "GWBulletPool",
          poolName: "GWBulletPool"
        } as ReclaimableComponent,
        collisionEvents: {
          type: "CollisionEvents",
          collisions: [],
          activeTriggers: [],
          triggersEntered: [],
          triggersExited: []
        } as CollisionEventsComponent,
        damage: {
          type: "Damage",
          amount: 1,
          category: "player_bullet",
          friendlyFire: false,
          consumption: "destroy-entity"
        } as DamageComponent,
        faction: {
          type: "Faction",
          faction: "player",
          value: "player"
        } as FactionComponent
      }),
      reset: (data) => {
        if (Object.isFrozen(data.position)) {
          data.position = { ...data.position };
        }
        data.position.x = 0;
        data.position.y = 0;
        data.position.worldX = 0;
        data.position.worldY = 0;
        data.position.dirty = true;
      },
      initializer: (data, p) => {
        if (Object.isFrozen(data.position)) {
          data.position = { ...data.position };
        }
        if (Object.isFrozen(data.velocity)) {
          data.velocity = { ...data.velocity };
        }
        if (Object.isFrozen(data.render)) {
          data.render = { ...data.render };
        }
        if (Object.isFrozen(data.collider)) {
          data.collider = { ...data.collider };
        }
        if (Object.isFrozen(data.ttl)) {
          data.ttl = { ...data.ttl };
        }

        data.position.x = p.x;
        data.position.y = p.y;
        data.position.rotation = p.shape ? parseFloat(p.shape) : 0; // Use shape or params to pass rotation
        data.position.worldX = p.x;
        data.position.worldY = p.y;
        // TODO(refactor): código duplicado detectado (bloque) con shared/arcade/ParticlePool.ts:123-132. Considerar extraer a función compartida. Ref: e0b47b36
        data.position.worldRotation = data.position.rotation;
        data.position.dirty = true;

        data.velocity.vx = p.dx;
        data.velocity.vy = p.dy;

        data.render.size = p.size;
        data.render.color = p.color;
        data.render.rotation = data.position.rotation;

        if (data.collider.shape.type === ShapeType.Circle) {
          (data.collider.shape as CircleShape).radius = p.size / 2;
        }

        data.ttl.remaining = p.ttl;
        data.ttl.timeLeft = p.ttl;
      }
    });
  }

  public acquireBullet(world: World, x: number, y: number, dx: number, dy: number, size: number, color: string, ttl: number, rotation: number): Entity {
    return this.acquire(world, { x, y, dx, dy, size, color, ttl, shape: rotation.toString() });
  }
}

/**
 * Standardized GWParticlePool for Geometry Wars.
 * Extends SharedParticlePool for cross-game consistency.
 * @public
 */
export class GWParticlePool extends SharedParticlePool {
  constructor() {
    super({
      poolId: "GWParticlePool",
      shape: "gw_particle",
      order: 3,
      isTrigger: true
    });
  }
}
