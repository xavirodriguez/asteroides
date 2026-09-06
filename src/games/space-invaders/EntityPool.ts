import { World } from "@tiny-aster/core";
import { CollisionLayers } from "@tiny-aster/gameplay-kit";
import { Entity, BoundaryComponent, TransformComponent, VelocityComponent, RenderComponent, ColliderComponent, CircleShape, ShapeType, CollisionEventsComponent, ReclaimableComponent } from "@tiny-aster/core";
import { GAME_CONFIG } from "./types/SpaceInvadersTypes";
import { ProjectilePool, ProjectileParams } from "@tiny-aster/core";
import { DamageComponent, FactionComponent } from "@tiny-aster/gameplay-kit";
import { SharedParticlePool } from "@tiny-aster/gameplay-kit";

export type BulletPoolConfig = {
  shape: string;
  layer: number;
  mask: number;
  poolId: string;
  bulletType: "PlayerBullet" | "EnemyBullet";
  damageCategory: string;
  faction: "player" | "enemy";
};

function createBulletPoolConfig(config: BulletPoolConfig) {
  // TODO(refactor): código duplicado detectado (bloque) con geometrywars/EntityPool.ts:27-51. Considerar extraer a función compartida. Ref: 35db7868
  return {
    factory: () => ({
      position: { type: "Transform", x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, worldX: 0, worldY: 0, worldRotation: 0, worldScaleX: 1, worldScaleY: 1, dirty: false } as TransformComponent,
      velocity: { type: "Velocity", vx: 0, vy: 0, angularVelocity: 0 } as VelocityComponent,
      render: { type: "Render", shape: config.shape, size: 0, color: "", rotation: 0, visible: true, opacity: 1, order: 10, hitFlashFrames: 0, angularVelocity: 0 } as RenderComponent,
      collider: {
        type: "Collider",
        shape: { type: ShapeType.Circle, radius: 0 } as CircleShape,
        layer: config.layer,
        mask: config.mask,
        offsetX: 0, offsetY: 0, isTrigger: false, enabled: true
      } as ColliderComponent,
      boundary: {
        type: "Boundary",
        width: GAME_CONFIG.SCREEN_WIDTH,
        height: GAME_CONFIG.SCREEN_HEIGHT,
        mode: "destroy"
      } as BoundaryComponent,
      ttl: { type: "TTL", remaining: 0, timeLeft: 0 },
      reclaimable: { type: "Reclaimable", poolId: config.poolId, poolName: config.poolId } as ReclaimableComponent,
      bullet: { type: config.bulletType },
      collisionEvents: {
        type: "CollisionEvents",
        collisions: [],
        activeTriggers: [],
        triggersEntered: [],
        triggersExited: []
      } as CollisionEventsComponent,
      damage: { type: "Damage", amount: 1, category: config.damageCategory, friendlyFire: false, consumption: "destroy-entity" } as DamageComponent,
      faction: { type: "Faction", faction: config.faction, value: config.faction } as FactionComponent
    }),
    reset: (data: any) => {
      data.position = { type: "Transform", x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, worldX: 0, worldY: 0, worldRotation: 0, worldScaleX: 1, worldScaleY: 1, dirty: false };
      data.velocity = { type: "Velocity", vx: 0, vy: 0, angularVelocity: 0 };
      data.render = { type: "Render", shape: config.shape, size: 0, color: "", rotation: 0, visible: true, opacity: 1, order: 10, hitFlashFrames: 0, angularVelocity: 0 };
      data.ttl = { type: "TTL", remaining: 0, timeLeft: 0 };
      data.collisionEvents = { type: "CollisionEvents", collisions: [], activeTriggers: [], triggersEntered: [], triggersExited: [] };
    },
    initializer: (data: any, p: ProjectileParams) => {
      // TODO(refactor): código duplicado detectado (bloque) con shared/arcade/ParticlePool.ts:120-132. Considerar extraer a función compartida. Ref: f9c5c1f8
      data.position.x = p.x;
      data.position.y = p.y;
      data.position.worldX = p.x;
      // TODO(refactor): código duplicado detectado (bloque) con geometrywars/EntityPool.ts:135-143. Considerar extraer a función compartida. Ref: 3437c2d8
      data.position.worldY = p.y;
      data.position.dirty = true;
      data.velocity.vx = p.dx;
      data.velocity.vy = p.dy;
      data.render.size = p.size;
      data.render.color = p.color;
      data.render.visible = true;
      data.render.opacity = 1;
      if (data.collider.shape.type === ShapeType.Circle) {
        (data.collider.shape as CircleShape).radius = p.size;
      }
      data.boundary.width = GAME_CONFIG.SCREEN_WIDTH;
      data.boundary.height = GAME_CONFIG.SCREEN_HEIGHT;
      data.ttl.remaining = p.ttl;
      data.ttl.timeLeft = p.ttl;
    }
  };
}

/**
 * Standardized Player Bullet Pool for Space Invaders.
 */
export class PlayerBulletPool extends ProjectilePool<any, ProjectileParams> {
  constructor() {
    super(createBulletPoolConfig({
      shape: "player_bullet",
      layer: CollisionLayers.PROJECTILE,
      mask: CollisionLayers.ENEMY | CollisionLayers.DEBRIS,
      poolId: "PlayerBulletPool",
      bulletType: "PlayerBullet",
      damageCategory: "player_bullet",
      faction: "player"
    }));
  }

  // TODO(refactor): código duplicado detectado (método) con space-invaders/EntityPool.ts:115-126. Considerar extraer a función compartida. Ref: 8fca2904
  public acquireInvaderBullet(world: World, x: number, y: number, dx: number, dy: number, size: number, color: string, ttl: number): Entity {
    return this.acquire(world, { x, y, dx, dy, size, color, ttl });
  }
}

/**
 * Standardized Enemy Bullet Pool for Space Invaders.
 */
export class EnemyBulletPool extends ProjectilePool<any, ProjectileParams> {
  constructor() {
    super(createBulletPoolConfig({
      shape: "enemy_bullet",
      layer: CollisionLayers.ENEMY,
      mask: CollisionLayers.PLAYER | CollisionLayers.DEBRIS,
      poolId: "EnemyBulletPool",
      bulletType: "EnemyBullet",
      damageCategory: "enemy_bullet",
      faction: "enemy"
    }));
  }

  public acquireInvaderBullet(world: World, x: number, y: number, dx: number, dy: number, size: number, color: string, ttl: number): Entity {
    return this.acquire(world, { x, y, dx, dy, size, color, ttl });
  }
}

/**
 * Standardized Particle Pool for Space Invaders.
 */
export class ParticlePool extends SharedParticlePool {
  constructor() {
    super({
      poolId: "ParticlePool",
      shape: "particle",
      order: 15,
      isTrigger: true
    });
  }
}
