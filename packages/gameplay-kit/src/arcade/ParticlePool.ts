import {
  ProjectilePool,
  ProjectileParams,
  TransformComponent,
  VelocityComponent,
  RenderComponent,
  ColliderComponent,
  ReclaimableComponent,
  CollisionEventsComponent,
  ShapeType,
  CircleShape
} from "@tiny-aster/core";

export interface SharedParticlePoolConfig {
  poolId?: string;
  shape?: string;
  order?: number;
  isTrigger?: boolean;
}

/**
 * Reusable, high-performance particle pool across TinyAster games.
 * @public
 */
export class SharedParticlePool extends ProjectilePool<any, ProjectileParams> {
  constructor(config: SharedParticlePoolConfig = {}) {
    const poolId = config.poolId ?? "ParticlePool";
    const shape = config.shape ?? "particle";
    const order = config.order ?? 10;
    const isTrigger = config.isTrigger ?? true;

    // TODO(refactor): código duplicado detectado (bloque) con geometrywars/EntityPool.ts:27-51. Considerar extraer a función compartida. Ref: 6c6321d0
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
          shape,
          size: 0,
          color: "",
          rotation: 0,
          visible: true,
          opacity: 1,
          order,
          hitFlashFrames: 0,
          angularVelocity: 0
        } as RenderComponent,
        collider: {
          type: "Collider",
          shape: { type: ShapeType.Circle, radius: 0 } as CircleShape,
          layer: 0,
          mask: 0,
          offsetX: 0,
          offsetY: 0,
          isTrigger,
          enabled: false
        } as ColliderComponent,
        ttl: {
          type: "TTL",
          remaining: 0,
          timeLeft: 0
        },
        reclaimable: {
          type: "Reclaimable",
          poolId,
          poolName: poolId
        } as ReclaimableComponent,
        collisionEvents: {
          type: "CollisionEvents",
          collisions: [],
          activeTriggers: [],
          triggersEntered: [],
          triggersExited: []
        } as CollisionEventsComponent
      }),
      reset: (data) => {
        if (Object.isFrozen(data.position)) data.position = { ...data.position };
        if (Object.isFrozen(data.velocity)) data.velocity = { ...data.velocity };
        if (Object.isFrozen(data.render)) data.render = { ...data.render };
        if (Object.isFrozen(data.ttl)) data.ttl = { ...data.ttl };

        data.position.x = 0;
        data.position.y = 0;
        data.position.worldX = 0;
        data.position.worldY = 0;
        data.position.dirty = true;

        data.velocity.vx = 0;
        data.velocity.vy = 0;

        data.ttl.remaining = 0;
        data.ttl.timeLeft = 0;
      },
      initializer: (data, p) => {
        if (Object.isFrozen(data.position)) data.position = { ...data.position };
        if (Object.isFrozen(data.velocity)) data.velocity = { ...data.velocity };
        if (Object.isFrozen(data.render)) data.render = { ...data.render };
        if (Object.isFrozen(data.collider)) data.collider = { ...data.collider };
        if (Object.isFrozen(data.ttl)) data.ttl = { ...data.ttl };

        data.position.x = p.x;
        data.position.y = p.y;
        data.position.worldX = p.x;
        // TODO(refactor): código duplicado detectado (bloque) con geometrywars/EntityPool.ts:134-142. Considerar extraer a función compartida. Ref: e0b47b36
        data.position.worldY = p.y;
        data.position.dirty = true;

        data.velocity.vx = p.dx;
        data.velocity.vy = p.dy;

        data.render.size = p.size;
        data.render.color = p.color;

        data.ttl.remaining = p.ttl;
        data.ttl.timeLeft = p.ttl;
      }
    });
  }

  public acquireParticle(
    world: any,
    x: number,
    y: number,
    dx: number,
    dy: number,
    size: number,
    color: string,
    ttl: number
  ) {
    return this.acquire(world, { x, y, dx, dy, size, color, ttl });
  }

  public clear(): void {}
}
