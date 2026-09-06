import { System, World } from "@tiny-aster/core";
import { TransformComponent } from "@tiny-aster/core";
import { FormationComponent, InvaderComponent, SpaceInvadersComponentRegistry, GAME_CONFIG } from "../types/SpaceInvadersTypes";
import { SpaceInvadersConfig } from "../types/SpaceInvadersConfigSchema";
import { EnemyBulletPool } from "../EntityPool";
import { createEnemyBullet } from "../EntityFactory";
import { RandomService } from "@tiny-aster/core";

/**
 * System that manages the movement and firing of the invader formation.
 */
export class SpaceInvadersFormationSystem extends System<SpaceInvadersComponentRegistry> {
  private enemyBulletPool: EnemyBulletPool;
  private config?: SpaceInvadersConfig;
  private columnShooters: Map<number, { entity: number; y: number }> = new Map();
  private shooterPool: Array<{ entity: number; y: number }> = [];

  constructor(enemyBulletPool: EnemyBulletPool) {
    super();
    // TODO(refactor): código duplicado detectado (bloque) con space-invaders/systems/BossSystem.ts:41-49. Considerar extraer a función compartida. Ref: d157968e
    this.enemyBulletPool = enemyBulletPool;
  }

  public update(world: World<SpaceInvadersComponentRegistry>, deltaTime: number): void {
    if (world.getResource("IsPaused") === true) return;
    if (!this.config) {
        this.config = world.getResource<SpaceInvadersConfig>("GameConfig")!;
    }

    const gameState = world.getSingleton("GameState");
    if (gameState && (gameState.isGameOver || gameState.readyRemaining > 0 || gameState.intermissionRemaining > 0 || gameState.continueCountdownRemaining > 0)) return;

    const formationEntities = world.query("Formation");
    if (formationEntities.length === 0) return;

    const formationEntity = formationEntities[0];
    const formation = world.getComponent(formationEntity, "Formation");
    if (!formation) return;

    const invaders = world.query("Invader", "Transform");
    if (invaders.length === 0) return;

    // 1. Calculate current speed based on remaining invaders and level progression
    const totalInvaders = formation.totalInvaders > 0
      ? formation.totalInvaders
      : (this.config.INVADER_ROWS * this.config.INVADER_COLS);
    const ratio = 1 - (invaders.length / totalInvaders);

    const level = gameState?.level || 1;
    const levelSpeedMult = Math.pow(this.config.LEVEL_SPEED_MULTIPLIER ?? 1.1, level - 1);
    const levelFireRateMult = Math.pow(this.config.LEVEL_FIRE_RATE_MULTIPLIER ?? 0.97, level - 1);

    const baseSpeed = this.config.INVADER_SPEED_BASE * levelSpeedMult;
    const maxSpeed = this.config.INVADER_SPEED_MAX * levelSpeedMult;
    const newSpeed = baseSpeed + ratio * (maxSpeed - baseSpeed);

    if (formation.speed !== newSpeed) {
      world.mutateComponent(formationEntity, "Formation", f => {
        f.speed = newSpeed;
      });
    }

    // Heuristic: detect if deltaTime is in milliseconds (as in unit tests) or seconds (as in game loop)
    const isMs = deltaTime > 1.0;
    const dtSeconds = isMs ? deltaTime / 1000 : deltaTime;

    // 2. Move formation or handle step down
    const margin = 20;
    const moveX = formation.direction * formation.speed * dtSeconds;

    // Safe for determinism/rollback. Sequential indexed loops replace for..of iterators to avoid per-tick iterator allocations.
    let minX = Infinity;
    let maxX = -Infinity;
    const invCount = invaders.length;

    for (let i = 0; i < invCount; i++) {
      const entity = invaders[i];
      const pos = world.getComponent(entity, "Transform");
      if (!pos) continue;
      if (pos.x < minX) minX = pos.x;
      if (pos.x > maxX) maxX = pos.x;
    }

    const leftLimit = margin;
    const rightLimit = GAME_CONFIG.SCREEN_WIDTH - margin;

    // Use predictive edge checking considering movement direction
    const willHitRight = formation.direction > 0 && maxX + moveX >= rightLimit;
    const willHitLeft  = formation.direction < 0 && minX + moveX <= leftLimit;

    if (willHitRight || willHitLeft) {
      const directionBefore = formation.direction;
      const nextDirection = (directionBefore * -1) as 1 | -1;
      const descentStep = formation.descentStep;

      // Movimiento vertical inmediato (estructuralmente distribuido)
      for (let i = 0; i < invCount; i++) {
        const entity = invaders[i];
        const pos = world.getComponent(entity, "Transform");
        if (pos) {
          const nextY = pos.y + descentStep;
          const t = world.getMutableComponent(entity, "Transform");
          if (t) {
            t.y = nextY;
            t.dirty = true;
          }
        }
      }

      world.mutateComponent(formationEntity, "Formation", f => {
        f.stepDownPending = false;
        f.direction = nextDirection;
      });
      console.debug("[SpaceInvaders] formation step down", {
        directionBefore,
        directionAfter: nextDirection,
        invaderCount: invaders.length,
      });
    } else {
      for (let i = 0; i < invCount; i++) {
        const entity = invaders[i];
        const pos = world.getComponent(entity, "Transform");
        if (pos) {
          const nextX = pos.x + moveX;
          const t = world.getMutableComponent(entity, "Transform");
          if (t) {
            t.x = nextX;
            t.dirty = true;
          }
        }
      }
    }

    // 3. Enemy firing logic
    let shouldFire = false;
    let nextCooldownRemaining: number;
    const minFireInterval = this.config.ENEMY_FIRE_INTERVAL_MIN * levelFireRateMult;
    const maxFireInterval = this.config.ENEMY_FIRE_INTERVAL_MAX * levelFireRateMult;

    if (isMs) {
      // In millisecond-based unit tests
      nextCooldownRemaining = formation.fireCooldownRemaining - deltaTime;
      if (nextCooldownRemaining <= 0) {
        shouldFire = true;
        const rng = world.gameplayRandom;
        nextCooldownRemaining = rng.nextRange(
          minFireInterval,
          maxFireInterval
        ) / (1 + ratio);
      }
    } else {
      // In second-based game loop
      let currentCooldown = formation.fireCooldownRemaining;
      if (currentCooldown > 100) {
        currentCooldown = currentCooldown / 1000;
      }
      nextCooldownRemaining = currentCooldown - dtSeconds;
      if (nextCooldownRemaining <= 0) {
        shouldFire = true;
        const rng = world.gameplayRandom;
        const nextCooldown = (rng.nextRange(
          minFireInterval,
          maxFireInterval
        ) / 1000) / (1 + ratio);
        nextCooldownRemaining = nextCooldown;
      }
    }

    // Pure mutation
    world.mutateComponent(formationEntity, "Formation", f => {
      f.fireCooldownRemaining = nextCooldownRemaining;
    });

    if (shouldFire) {
      // Estructural: llamar a factorías FUERA de mutateComponent
      this.fireFromFormation(world, invaders);
    }
  }

  private fireFromFormation(world: World<SpaceInvadersComponentRegistry>, invaderEntities: ReadonlyArray<number>): void {
    // Safe for determinism/rollback. Reusing instance Map and pooled shooter slots eliminates per-fire-tick Map and object allocations.
    this.columnShooters.clear();
    const len = invaderEntities.length;
    let poolIndex = 0;

    for (let i = 0; i < len; i++) {
      const entity = invaderEntities[i];
      const invader = world.getComponent(entity, "Invader");
      const pos = world.getComponent(entity, "Transform");
      if (invader && pos) {
        const existing = this.columnShooters.get(invader.col);
        if (!existing) {
          let slot = this.shooterPool[poolIndex];
          if (!slot) {
            slot = { entity, y: pos.y };
            this.shooterPool[poolIndex] = slot;
          } else {
            slot.entity = entity;
            slot.y = pos.y;
          }
          poolIndex++;
          this.columnShooters.set(invader.col, slot);
        } else if (pos.y > existing.y) {
          existing.entity = entity;
          existing.y = pos.y;
        }
      }
    }

    const colSize = this.columnShooters.size;
    if (colSize > 0) {
      const rng = world.gameplayRandom;
      const targetIndex = rng.nextInt(0, colSize);
      let currentIndex = 0;
      let selectedShooter: { entity: number; y: number } | undefined;

      // Safe for determinism/rollback. Iterating map values directly avoids Array.from() heap allocations on firing ticks.
      for (const colShooter of this.columnShooters.values()) {
        if (currentIndex === targetIndex) {
          selectedShooter = colShooter;
          break;
        }
        currentIndex++;
      }

      if (selectedShooter) {
        const shooterPos = world.getComponent(selectedShooter.entity, "Transform");
        if (shooterPos) {
          createEnemyBullet(world, shooterPos.x, shooterPos.y + 15, this.enemyBulletPool);
        }
      }
    }
  }
}
