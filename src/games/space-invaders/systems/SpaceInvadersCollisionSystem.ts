import { World, ComponentType, Juice, CoreComponentRegistry } from "@tiny-aster/core";
import { System } from "@tiny-aster/core";
import { Entity } from "@tiny-aster/core";
import { EventBus } from "@tiny-aster/core";
import { TransformComponent, HealthComponent, RenderComponent, TTLComponent } from "@tiny-aster/core";
import { spawnScorePopup } from "@tiny-aster/gameplay-kit";
import {
  GameStateComponent,
  InvaderComponent,
  ShieldComponent,
  BossComponent,
  UITextComponent,
  SpaceInvadersComponentRegistry,
  SpaceInvadersEventRegistry,
  GAME_CONFIG
} from "../types/SpaceInvadersTypes";
import { SpaceInvadersConfig } from "../types/SpaceInvadersConfigSchema";
import { ParticlePool } from "../EntityPool";
import { createSharedParticle } from "../../shared/rendering/SharedVFX";

/**
 * System that handles game-specific collision reactions and combat side-effects.
 *
 * @remarks
 * **Collision & Combat Pipeline Architecture:**
 * 1. `CollisionSystem2D` (`SystemPhase.Collision`): Evaluates geometric contact/overlap
 *    using hitboxes/colliders and populates `CollisionEventsComponent`. Does not mutate health or destroy entities.
 * 2. `CombatSystem` (`SystemPhase.Collision`): Processes `CollisionEventsComponent` to apply
 *    generic health reductions (`DamageComponent` vs `HealthComponent`) and emits deferred `combat:hit` and `combat:death` events.
 * 3. `SpaceInvadersCollisionSystem` (`SystemPhase.GameRules`): Reacts to `combat:hit` and `combat:death` events
 *    to trigger game-specific rules (combo chain updates, score gain, lives decrement, particle explosions, SFX, floating popups, and shield degradation).
 *
 * Being in `SystemPhase.GameRules` guarantees that all physical contact and damage values are fully resolved
 * before game rules, combo meters, and audio/VFX side-effects are calculated.
 */
export class SpaceInvadersCollisionSystem extends System<SpaceInvadersComponentRegistry, SpaceInvadersEventRegistry> {
  private config?: SpaceInvadersConfig;
  private destroyedEntities = new Set<number>();
  private pairResult: { [key: string]: Entity } = {};

  constructor(private _particlePool: ParticlePool) {
    super();
  }

  public override onRegister(world: World<SpaceInvadersComponentRegistry, SpaceInvadersEventRegistry>): void {
    if (!this.config) {
      this.config = world.getResource<SpaceInvadersConfig>("GameConfig")!;
    }
    const eventBus = world.getEventBus();
    if (eventBus) {
      eventBus.on("combat:hit", (event: any) => {
        this.onCombatHit(world, event);
      });
      eventBus.on("combat:death", (event: any) => {
        this.onCombatDeath(world, event);
      });
    }
  }

  private onCombatHit(world: World<SpaceInvadersComponentRegistry>, event: any): void {
    if (!this.config) {
      this.config = world.getResource<SpaceInvadersConfig>("GameConfig")!;
    }
    const target = event.targetEntity;
    if (!target) return;

    if (world.hasComponent(target, "Player")) {
      world.mutateComponent(target, "Render", (render) => {
        render.hitFlashFrames = 10;
      });

      world.mutateComponent(target, "Health", (health) => {
        health.invulnerableRemaining = 1.5; // 1.5 seconds
      });

      // Apply Squash & Stretch to Player ship on hit
      Juice.squash(world as World<CoreComponentRegistry>, target, 0.7, 1.4, 300);

      // Contextual heavy screen shake on player hit
      Juice.shake(world as World<CoreComponentRegistry>, 10, 300);

      const health = world.getComponent(target, "Health");
      world.mutateSingleton("GameState", (gs) => {
        if (health) {
          gs.lives = health.current;
        }
        if (health && health.current <= 0) {
          gs.isGameOver = true;
            const eventBus = world.getEventBus();
          if (eventBus && !world.isReSimulating) {
              eventBus.emitDeferred("PlaySFX", { name: "game_over" });
          }
        } else {
            const eventBus = world.getEventBus();
          if (eventBus && !world.isReSimulating) {
              eventBus.emitDeferred("PlaySFX", { name: "hit" });
          }
        }
      });
    }

    if (world.hasComponent(target, "Boss")) {
      const bossComp = world.getComponent(target, "Boss");
      if (bossComp) {
        const health = world.getComponent(target, "Health");
        const nextHp = health ? health.current : bossComp.hp - 1;

        world.mutateComponent(target, "Boss", (b) => {
          b.hp = nextHp;
        });

        world.mutateComponent(target, "Render", (render) => {
          render.hitFlashFrames = 5;
        });

        // Apply hit-stop (50ms) and Squash & Stretch to Boss on hit
        world.setResource("GameplayFreeze", { remaining: 0.05 });
        Juice.squash(world as World<CoreComponentRegistry>, target, 1.2, 0.8, 200);

        const pos = world.getComponent(target, "Transform");
        if (pos) {
          this.createExplosion(world, pos.x, pos.y, "#FF00FF");
        }

        world.mutateSingleton("GameState", (gs) => {
          gs.score += 100;
        });

        const eventBus = world.getEventBus();
        if (eventBus && !world.isReSimulating) {
          eventBus.emitDeferred("PlaySFX", { name: "hit" });
        }
      }
    }

    if (world.hasComponent(target, "Invader")) {
      world.mutateComponent(target, "Render", (render) => {
        render.hitFlashFrames = 4;
      });

      // Apply micro freeze-frame hit-stop (40ms) and Squash & Stretch deformation on invader hit
      world.setResource("GameplayFreeze", { remaining: 0.04 });
      Juice.squash(world as World<CoreComponentRegistry>, target, 1.25, 0.75, 120);

      const pos = world.getComponent(target, "Transform");
      if (pos) {
        this.createExplosion(world, pos.x, pos.y, "#00FFFF");
      }

      const eventBus = world.getEventBus();
      if (eventBus && !world.isReSimulating) {
        eventBus.emitDeferred("PlaySFX", { name: "hit" });
      }
    }
  }

  private onCombatDeath(world: World<SpaceInvadersComponentRegistry>, event: any): void {
    const target = event.entity;
    if (!target) return;

    if (world.hasComponent(target, "Invader")) {
      const invaderComp = world.getComponent(target, "Invader");
      const gameState = world.getSingleton("GameState");
      if (gameState) {
        // Mutate Combo component
        // TODO(refactor): código duplicado detectado (bloque) con asteroids/systems/AsteroidCollisionSystem.ts:55-63. Considerar extraer a función compartida. Ref: 76e7c40a
        let nextCombo = 0;
        let nextMultiplier = 1;

        const comboEntities = world.query("Combo");
        const comboEntity = comboEntities[0];
        if (comboEntity !== undefined) {
          world.mutateComponent(comboEntity, "Combo", (c) => {
            c.combo++;
            c.timerRemaining = this.config!.COMBO_TIMEOUT / 1000;
            c.multiplier = Math.min(this.config!.MAX_MULTIPLIER, 1 + Math.floor(c.combo / 5));
            nextCombo = c.combo;
            nextMultiplier = c.multiplier;
          });
        }

        let scoreGain = 0;
        if (invaderComp) {
          scoreGain = invaderComp.points * nextMultiplier;
        }
        const nextScore = gameState.score + scoreGain;

        world.mutateSingleton("GameState", gs => {
            gs.score = nextScore;
        });

        const pos = world.getComponent(target, "Transform");
        if (pos) {
          const explosionX = pos.x;
          const explosionY = pos.y;

          this.createExplosion(world, explosionX, explosionY, "#FFFFFF");

          // Dynamic popup text & color based on combo multiplier
          let popupColor = "#FFFF00";
          if (nextMultiplier >= 6) popupColor = "#FFD700"; // Gold
          else if (nextMultiplier >= 4) popupColor = "#FF00FF"; // Magenta
          else if (nextMultiplier >= 2) popupColor = "#00FFFF"; // Cyan

          const popupText = nextMultiplier > 1 ? `+${scoreGain} (x${nextMultiplier})` : `+${scoreGain}`;
          spawnScorePopup(world, explosionX, explosionY, popupText, popupColor);
        }

        // Contextual screen shake: light for single kills, medium for fast combo chains
        const shakeIntensity = nextCombo >= 5 ? 5.5 : 2.5;
        const shakeDuration = nextCombo >= 5 ? 180 : 100;
        Juice.shake(world as World<CoreComponentRegistry>, shakeIntensity, shakeDuration);

        const eventBus = world.getEventBus();
        if (eventBus) {
          eventBus.emitDeferred("si:kill", { chain: nextCombo });
          eventBus.emitDeferred("entity:destroyed", { entity: target, type: "Invader" });
          if (!world.isReSimulating) {
            eventBus.emitDeferred("PlaySFX", { name: "explosion" });
          }
        }

        const hasKami = world.hasComponent(target, 'Kamikaze');
        if (hasKami) {
          const nextKamikazes = gameState.kamikazesActive - 1;
          world.mutateSingleton("GameState", gs => {
              gs.kamikazesActive = nextKamikazes;
          });
        }
      }

      world.getCommandBuffer().removeEntity(target);
    }
  }

  // TODO(refactor): código duplicado detectado (método) con space-invaders/systems/BossSystem.ts:43-49. Considerar extraer a función compartida. Ref: ddc87c59
  public override update(world: World<SpaceInvadersComponentRegistry>, _deltaTime: number): void {
    if (world.getResource("IsPaused") === true) return;
    if (!this.config) {
        this.config = world.getResource<SpaceInvadersConfig>("GameConfig")!;
    }
    const gameState = world.getSingleton("GameState");
    if (!gameState || gameState.isGameOver) return;

    const entitiesWithEvents = world.query("CollisionEvents");
    // Safe for determinism/rollback. Reusing instance Set avoids per-tick heap allocations during collision resolution.
    // TODO(refactor): código duplicado detectado (bloque) con space-invaders/systems/SpaceInvadersCollisionSystem.ts:270-278. Considerar extraer a función compartida. Ref: 30754ba9
    this.destroyedEntities.clear();

    // Helper to check if entity exists and is active
    const hasEntity = (entity: number): boolean => {
      if (typeof (world as any).hasEntity === "function") {
        return (world as any).hasEntity(entity);
      }
      return world.hasComponent(entity, "Transform");
    };

    const len = entitiesWithEvents.length;
    for (let i = 0; i < len; i++) {
      const entityA = entitiesWithEvents[i];
      const eventsComp = world.getComponent(entityA, "CollisionEvents");
      if (!eventsComp) continue;

      for (const event of eventsComp.collisions) {
        const entityB = event.otherEntity;

        // Double Security A: Process each pair exactly once
        if (entityA >= entityB) continue;

        // Double Security B: Ensure both entities still exist
        if (!hasEntity(entityA) || !hasEntity(entityB)) continue;

        // Double Security C: Ensure they haven't already been destroyed in this update step
        if (this.destroyedEntities.has(entityA) || this.destroyedEntities.has(entityB)) continue;

        this.handleCollision(world, entityA, entityB, this.destroyedEntities);

        // Re-check game over state after each collision
        const currentGS = world.getSingleton("GameState");
        if (currentGS?.isGameOver) return;
      }
    }

    // Special check: Invaders reaching the bottom
    this.checkInvadersBottom(world, gameState);
  }

  private handleCollision(
    world: World<SpaceInvadersComponentRegistry>,
    e1: Entity,
    e2: Entity,
    destroyedEntities: Set<number>
  ): void {
    // TODO(refactor): código duplicado detectado (bloque) con space-invaders/systems/SpaceInvadersCollisionSystem.ts:225-233. Considerar extraer a función compartida. Ref: 553b6473
    if (destroyedEntities.has(e1) || destroyedEntities.has(e2)) return;

    // Helper to check if entity exists and is active
    const hasEntity = (entity: number): boolean => {
      if (typeof (world as any).hasEntity === "function") {
        return (world as any).hasEntity(entity);
      }
      return world.hasComponent(entity, "Transform");
    };

    if (!hasEntity(e1) || !hasEntity(e2)) return;

    const gameState = world.getSingleton("GameState");
    if (!gameState) return;

    const bossBullet = this.matchPair(world, e1, e2, "PlayerBullet", "Boss");
    if (bossBullet) {
      // Handled by CombatSystem & combat:hit reaction
      return;
    }

    const invaderBullet = this.matchPair(world, e1, e2, "PlayerBullet", "Invader");
    if (invaderBullet) {
      // Handled by CombatSystem & combat:death / combat:hit reaction
      return;
    }

    const bulletShield = this.matchPair(world, e1, e2, "PlayerBullet", "Shield") ||
                        this.matchPair(world, e1, e2, "EnemyBullet", "Shield");
    if (bulletShield) {
      const bullet = (bulletShield as Record<string, Entity>).PlayerBullet || (bulletShield as Record<string, Entity>).EnemyBullet;
      const shield = (bulletShield as Record<string, Entity>).Shield;

      if (hasEntity(shield) && !destroyedEntities.has(shield)) {
        this.damageShield(world, shield, destroyedEntities);
      }
      if (hasEntity(bullet) && !destroyedEntities.has(bullet)) {
        destroyedEntities.add(bullet);
        this.removeBulletSafely(world, bullet);
      }
      return;
    }

    const enemyBulletPlayer = this.matchPair(world, e1, e2, "EnemyBullet", "Player");
    if (enemyBulletPlayer) {
      // Handled by CombatSystem & combat:hit reaction
      return;
    }

    const invaderPlayer = this.matchPair(world, e1, e2, "Invader", "Player");
    if (invaderPlayer) {
      world.mutateSingleton("GameState", gs => {
          gs.isGameOver = true;
      });
      return;
    }

    const invaderShield = this.matchPair(world, e1, e2, "Invader", "Shield");
    if (invaderShield) {
      const shield = invaderShield.Shield;
      if (hasEntity(shield)) {
        this.damageShield(world, shield, destroyedEntities);
      }
      return;
    }
  }

  private damageShield(
    world: World<SpaceInvadersComponentRegistry>,
    shieldEntity: number,
    destroyedEntities: Set<number>
  ): void {
    if (destroyedEntities.has(shieldEntity)) return;
    if (!world.hasComponent(shieldEntity, "Shield")) return;
    const shield = world.getComponent(shieldEntity, "Shield");
    if (!shield) return;

    const nextHp = shield.hp - 1;
    const expired = nextHp <= 0;

    world.mutateComponent(shieldEntity, "Shield", s => {
      s.hp = nextHp;
    });

    if (expired) {
      world.getCommandBuffer().removeEntity(shieldEntity);
      destroyedEntities.add(shieldEntity);
    } else {
      world.mutateComponent(shieldEntity, "Render", render => {
        render.hitFlashFrames = 5;
      });
    }
  }

  private createExplosion(world: World<SpaceInvadersComponentRegistry>, x: number, y: number, color: string): void {
    // Solución: Usar el stream diseñado para la reproducción determinista en la fase de simulación
    const rng = world.gameplayRandom;

    for (let i = 0; i < this.config!.PARTICLE_COUNT; i++) {
      const angle = rng.next() * Math.PI * 2;
      const speed = rng.next() * 100 + 50;

      createSharedParticle(
        world,
        x,
        y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        color,
        this._particlePool,
        2,
        this.config!.PARTICLE_TTL_BASE
      );
    }
  }

  private removeBulletSafely(world: World<SpaceInvadersComponentRegistry>, bullet: Entity): void {
    if (typeof (world as any).isAlive === "function" && !(world as any).isAlive(bullet)) {
      return;
    }
    if (typeof (world as any).hasEntity === "function" && !(world as any).hasEntity(bullet)) {
      return;
    }
    if (!world.hasComponent(bullet, "Transform")) {
      return;
    }
    const reclaimable = world.getComponent(bullet, "Reclaimable");
    if (reclaimable) {
      if (typeof reclaimable.onReclaim === "function") {
        reclaimable.onReclaim({ world, entity: bullet });
      } else {
        const pool = world.getResource<any>(reclaimable.poolId);
        if (pool && typeof pool.release === "function") {
          pool.release({ world, entity: bullet });
        }
      }
    }
    world.getCommandBuffer().removeEntity(bullet);
  }

  private checkInvadersBottom(world: World<SpaceInvadersComponentRegistry>, _gameState: GameStateComponent): void {
    const invaders = world.query("Invader", "Transform");
    const limit = GAME_CONFIG.SCREEN_HEIGHT - 100;
    const len = invaders.length;

    for (let i = 0; i < len; i++) {
      const invader = invaders[i];
      const pos = world.getComponent(invader, "Transform");
      if (pos && pos.y > limit) {
        world.mutateSingleton("GameState", gs => {
            gs.isGameOver = true;
        });
        break;
      }
    }
  }

  // TODO(refactor): código duplicado detectado (método) con flappybird/systems/FlappyBirdCollisionSystem.ts:237-243. Considerar extraer a función compartida. Ref: 9ee5aed7
  private matchPair<T1 extends ComponentType<SpaceInvadersComponentRegistry>, T2 extends ComponentType<SpaceInvadersComponentRegistry>>(
    world: World<SpaceInvadersComponentRegistry>,
    entityA: Entity,
    entityB: Entity,
    type1: T1,
    type2: T2
  ): Record<T1 | T2, Entity> | undefined {
    // Safe for determinism/rollback. Reusing static pair object and clearing stale keys avoids object literal allocations per pair check while preventing property pollution.
    if (world.hasComponent(entityA, type1) && world.hasComponent(entityB, type2)) {
      this.clearPairResult();
      this.pairResult[type1 as string] = entityA;
      this.pairResult[type2 as string] = entityB;
      return this.pairResult as Record<T1 | T2, Entity>;
    }
    if (world.hasComponent(entityB, type1) && world.hasComponent(entityA, type2)) {
      this.clearPairResult();
      this.pairResult[type1 as string] = entityB;
      this.pairResult[type2 as string] = entityA;
      return this.pairResult as Record<T1 | T2, Entity>;
    }
    return undefined;
  }

  private clearPairResult(): void {
    for (const key in this.pairResult) {
      delete this.pairResult[key];
    }
  }
}
