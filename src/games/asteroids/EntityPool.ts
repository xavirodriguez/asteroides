import {
  World,
  Entity,
  TransformComponent,
  VelocityComponent,
  RenderComponent,
  ColliderComponent,
  CircleShape,
  ShapeType,
  CollisionEventsComponent,
  ReclaimableComponent,
  BoundaryComponent,
  TTLComponent,
  resolveThemeColor,
  ProjectilePool,
  ProjectileParams
} from "@tiny-aster/core";
import { CollisionLayers, DamageComponent, FactionComponent, SharedParticlePool } from "@tiny-aster/gameplay-kit";

/**
 * Parameters for acquiring an Asteroids bullet from the pool.
 * Extends ProjectileParams to remain fully compatible with ProjectilePool.
 * @public
 */
export interface AsteroidsBulletParams extends ProjectileParams {
  vx: number;
  vy: number;
  rotation?: number;
  ownerId?: string;
}

function createAsteroidsBulletPoolConfig() {
  return {
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
      velocity: { type: "Velocity", vx: 0, vy: 0, angularVelocity: 0 } as VelocityComponent,
      render: {
        type: "Render",
        shape: "bullet",
        size: 2,
        color: "",
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
        isTrigger: false,
        enabled: true
      } as ColliderComponent,
      ttl: { type: "TTL", remaining: 2.0, timeLeft: 2.0 } as TTLComponent,
      reclaimable: { type: "Reclaimable", poolId: "BulletPool", poolName: "BulletPool" } as ReclaimableComponent,
      bullet: { type: "Bullet", ownerId: undefined as string | undefined },
      collisionEvents: {
        type: "CollisionEvents",
        collisions: [],
        activeTriggers: [],
        triggersEntered: [],
        triggersExited: []
      } as CollisionEventsComponent,
      damage: { type: "Damage", amount: 1, category: "player_bullet", friendlyFire: false, consumption: "destroy-entity" } as DamageComponent,
      faction: { type: "Faction", faction: "player", value: "player" } as FactionComponent
    }),
    reset: (data: any) => {
      data.position.x = 0;
      data.position.y = 0;
      data.position.rotation = 0;
      data.position.dirty = true;
      data.velocity.vx = 0;
      data.velocity.vy = 0;
      data.velocity.angularVelocity = 0;
      data.render.shape = "bullet";
      data.render.size = 2;
      data.render.color = "";
      data.render.rotation = 0;
      data.render.visible = true;
      data.render.opacity = 1;
      data.bullet.ownerId = undefined;
      data.ttl.remaining = 2.0;
      data.ttl.timeLeft = 2.0;
      data.collisionEvents.collisions.length = 0;
      data.collisionEvents.activeTriggers.length = 0;
      data.collisionEvents.triggersEntered.length = 0;
      data.collisionEvents.triggersExited.length = 0;
    },
    initializer: (data: any, p: AsteroidsBulletParams, world: World, entity: Entity) => {
      const tint = resolveThemeColor(world, "bullet", "player-bullet");
      const gameConfig = world.getResource<any>("GameConfig");

      data.position.x = p.x;
      data.position.y = p.y;
      data.position.rotation = p.rotation ?? 0;
      data.position.dirty = true;

      data.velocity.vx = p.vx ?? p.dx;
      data.velocity.vy = p.vy ?? p.dy;

      data.render.color = p.color || tint;
      data.render.rotation = p.rotation ?? 0;
      data.render.visible = true;

      data.bullet.ownerId = p.ownerId;

      const ttlVal = p.ttl ?? gameConfig?.BULLET_TTL ?? 2.0;
      data.ttl.remaining = ttlVal;
      data.ttl.timeLeft = ttlVal;

      if (gameConfig?.BULLET_BOUNDARY_BEHAVIOR === "bounce") {
        const screen = world.getResource<{ width: number; height: number }>("ScreenConfig") || { width: 800, height: 600 };
        world.addComponent(entity, {
          type: "Boundary",
          width: screen.width,
          height: screen.height,
          mode: "bounce"
        } as BoundaryComponent);
      }
    }
  };
}

/**
 * Standardized Bullet Pool for Asteroids.
 * Extends ProjectilePool from @tiny-aster/core.
 * @public
 */
export class BulletPool extends ProjectilePool<any, AsteroidsBulletParams> {
  constructor() {
    super(createAsteroidsBulletPoolConfig());
  }

  public acquireBullet(world: World, params: AsteroidsBulletParams): Entity {
    return this.acquire(world, params);
  }
}

/**
 * Standardized, zero-allocation Particle Pool for Asteroids.
 * Extends SharedParticlePool for cross-game consistency.
 * @public
 */
export class ParticlePool extends SharedParticlePool {
  constructor() {
    super({
      poolId: "ParticlePool",
      shape: "particle",
      order: 10,
      isTrigger: true
    });
  }
}
