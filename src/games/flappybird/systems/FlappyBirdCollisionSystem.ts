import { World, ComponentType } from "@tiny-aster/core";
import { System } from "@tiny-aster/core";
import { Entity, TransformComponent, CollisionEventsComponent, ColliderComponent, ShapeType, RenderComponent } from "@tiny-aster/core";
import { IFlappyBirdGame } from "../types/GameInterfaces";
import { FlappyBirdState, BirdComponent, PipeComponent, FlappyBirdComponentRegistry } from "../types/FlappyBirdTypes";
import { Juice } from "@tiny-aster/core";
import { createEmitter } from "@tiny-aster/core";
import { EventBus } from "@tiny-aster/core";

/**
 * System that reacts to collision events between the bird and pipes or ground.
 */
import { FLAPPY_CONFIG } from "../types/FlappyBirdTypes";

export class FlappyBirdCollisionSystem extends System<FlappyBirdComponentRegistry> {
  private _game: IFlappyBirdGame;

  constructor(game: IFlappyBirdGame, private config: typeof FLAPPY_CONFIG = FLAPPY_CONFIG) {
    super();
    this._game = game;
  }

  public override update(world: World<FlappyBirdComponentRegistry>, deltaTime: number): void {
    if (world.getResource("IsPaused") === true) return;
    // Decrementar coyote timer, aplicar flash visual y disparar game over si expiró
    const birds = world.query("Bird");
    for (let i = 0; i < birds.length; i++) {
      const bird = birds[i];
      const b = world.getComponent(bird, "Bird");
      if (b && b.coyoteTimer > 0) {
        // Safe for determinism/rollback. Direct getMutableComponent avoids closure allocation and redundant component re-fetching.
        const mutableBird = world.getMutableComponent(bird, "Bird");
        if (mutableBird) {
          const res = mutableBird.coyoteTimer - deltaTime;
          mutableBird.coyoteTimer = res < 0.001 ? 0 : res;
          if (mutableBird.coyoteTimer === 0) {
            this.triggerGameOver(world);
            return;
          }
        }
        const mutableRender = world.getMutableComponent(bird, "Render");
        if (mutableRender) {
          mutableRender.hitFlashFrames = 2;
        }
      }
    }

    const entitiesWithEvents = world.query("CollisionEvents");

    for (const entity of entitiesWithEvents) {
      const eventsComp = world.getComponent(entity, "CollisionEvents")!;

      for (const event of eventsComp.collisions) {
        // Ensure each collision pair is processed only once
        if (entity > event.otherEntity) continue;
        this.resolveCollision(world, entity, event.otherEntity);
      }
    }

    // Still need to handle near miss logic which is not a physical collision
    this.handleNearMissLogic(world);
  }

  private resolveCollision(world: World<FlappyBirdComponentRegistry>, entityA: Entity, entityB: Entity): void {
    const matchPipe = this.matchPair(world, entityA, entityB, "Bird", "Pipe");
    if (matchPipe) {
      // Activar coyote timer en lugar de game over inmediato
      // Safe for determinism/rollback. Direct getMutableComponent avoids callback allocation.
      const birdComp = world.getMutableComponent(matchPipe["Bird"], "Bird");
      if (birdComp && birdComp.coyoteTimer <= 0) {
        birdComp.coyoteTimer = this.config.COYOTE_TIME;
        const eventBus = world.getResource<EventBus>("EventBus");
        if (eventBus) {
          eventBus.emitDeferred("PlaySFX", { name: "hit" });
        }
      }
      return;
    }
    // Ground collision es instantánea (sin coyote time)
    const matchGround = this.matchPair(world, entityA, entityB, "Bird", "Ground" as any);
    if (matchGround) {
      this.triggerGameOver(world);
    }
  }

  private handleNearMissLogic(world: World<FlappyBirdComponentRegistry>): void {
    const birds = world.query("Bird", "Transform", "Collider");
    const pipes = world.query("Pipe", "Transform", "Collider");

    for (const bird of birds) {
      const birdComp = world.getComponent(bird, "Bird")!;
      if (!birdComp.isAlive) continue;

      const birdPos = world.getComponent(bird, "Transform")!;
      const birdCol = world.getComponent(bird, "Collider")!; // radius is in shape
      const birdRadius = birdCol.shape.type === ShapeType.Circle ? birdCol.shape.radius : 0;

      for (const pipe of pipes) {
        const pipePos = world.getComponent(pipe, "Transform")!;
        const pipeComp = world.getComponent(pipe, "Pipe")!;
        const pipeCol = world.getComponent(pipe, "Collider")!;

        const pipeWidth = pipeCol.shape.type === ShapeType.Box ? pipeCol.shape.width : 0;
        const halfPipeHeight = pipeCol.shape.type === ShapeType.Box ? pipeCol.shape.height / 2 : 0;
        const isTopPipe = pipePos.y < pipeComp.gapY;

        // Bird AABB
        const birdLeft = birdPos.x - birdRadius;
        const birdRight = birdPos.x + birdRadius;
        const birdTop = birdPos.y - birdRadius;
        const birdBottom = birdPos.y + birdRadius;

        // Pipe AABB
        const pipeLeft = pipePos.x - pipeWidth / 2;
        const pipeRight = pipePos.x + pipeWidth / 2;
        let pipeTop: number;
        let pipeBottom: number;

        if (isTopPipe) {
          pipeTop = pipePos.y - halfPipeHeight;
          pipeBottom = pipePos.y + halfPipeHeight;
        } else {
          pipeTop = pipePos.y - halfPipeHeight;
          pipeBottom = pipePos.y + halfPipeHeight;
        }

        const horizontalDist = Math.max(0, pipeLeft - birdRight, birdLeft - pipeRight);
        const verticalDist = Math.max(0, pipeTop - birdBottom, birdTop - pipeBottom);
        const dist = horizontalDist + verticalDist;

        if (dist > 0 && dist < this.config.NEAR_MISS_THRESHOLD) {
           if (birdComp.nearMissTimer <= 0) {
             const points = Math.max(10, Math.round(
               this.config.MAX_NEAR_MISS_POINTS * (1 - dist / this.config.NEAR_MISS_THRESHOLD)
             ));

             world.mutateComponent(bird, "Bird", b => {
                b.nearMissTimer = 0.3;
             });

             world.mutateSingleton("FlappyState", gs => {
                 gs.score += points;
             });

             const eventBus = world.getResource<EventBus>("EventBus");
             if (eventBus) eventBus.emitDeferred("flappy:near_miss", { points });

             const closeness = 1 - dist / this.config.NEAR_MISS_THRESHOLD;
             const particleCount = Math.max(3, Math.round(12 * closeness));
             const minSpeed = Math.round(40 + 40 * closeness);
             const maxSpeed = Math.round(80 + 80 * closeness);

             Juice.shake(world, 2, 100);
           }
        }
      }
    }
  }

  private triggerGameOver(world: World<FlappyBirdComponentRegistry>): void {
    const gameState = world.getSingleton("FlappyState");
    if (gameState && !gameState.isGameOver) {
      world.mutateSingleton("FlappyState", gs => {
          gs.isGameOver = true;
      });

      const comboEntities = world.query("Combo");
      if (comboEntities.length > 0) {
        world.mutateComponent(comboEntities[0], "Combo", (c: any) => {
          c.combo = 0;
          c.multiplier = 1;
          c.timerRemaining = 0;
        });
      }

      const eventBus = world.getResource<EventBus>("EventBus");
      if (eventBus) {
        eventBus.emitDeferred("PlaySFX", { name: "hit" });
        eventBus.emitDeferred("PlaySFX", { name: "game_over" });
      }

      const birds = world.query("Bird");
      birds.forEach(birdEntity => {
        world.mutateComponent(birdEntity, "Bird", b => {
            b.isAlive = false;
        });

        world.mutateComponent(birdEntity, "Render", render => {
            render.hitFlashFrames = 8;
        });

        Juice.add(world, birdEntity, {
          property: "scaleX",
          target: 0.5,
          duration: 100,
          easing: "easeOut"
        });
        Juice.add(world, birdEntity, {
          property: "scaleX",
          target: 0,
          duration: 200,
          easing: "elasticOut",
          delay: 100
        });
        Juice.add(world, birdEntity, {
          property: "scaleY",
          target: -0.5,
          duration: 100,
          easing: "easeOut"
        });
        Juice.add(world, birdEntity, {
          property: "scaleY",
          target: 0,
          duration: 200,
          easing: "elasticOut",
          delay: 100
        });
      });
    }
  }

  // TODO(refactor): código duplicado detectado (método) con space-invaders/systems/SpaceInvadersCollisionSystem.ts:426-433. Considerar extraer a función compartida. Ref: 9ee5aed7
  private matchPair<T1 extends ComponentType<FlappyBirdComponentRegistry>, T2 extends ComponentType<FlappyBirdComponentRegistry>>(
    world: World<FlappyBirdComponentRegistry>,
    entityA: Entity,
    entityB: Entity,
    type1: T1,
    type2: T2
  ): Record<T1 | T2, Entity> | undefined {
    if (world.hasComponent(entityA, type1) && world.hasComponent(entityB, type2)) {
      return { [type1]: entityA, [type2]: entityB } as Record<T1 | T2, Entity>;
    }
    if (world.hasComponent(entityB, type1) && world.hasComponent(entityA, type2)) {
      return { [type1]: entityB, [type2]: entityA } as Record<T1 | T2, Entity>;
    }
    return undefined;
  }
}
