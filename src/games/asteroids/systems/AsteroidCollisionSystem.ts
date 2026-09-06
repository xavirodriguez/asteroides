/* eslint-disable @typescript-eslint/no-explicit-any */
import { World, System } from "@tiny-aster/core";
import { AsteroidsComponentRegistry, AsteroidsEventRegistry } from "../types/AsteroidRegistry";
import { fragmentAsteroid } from "../EntityFactory";
import { spawnScorePopup } from "@tiny-aster/gameplay-kit";
import { createSharedParticle } from "../../shared/rendering/SharedVFX";
import { getLogsForLevel } from "../story/StoryBeats";

/**
 * System to resolve collision logic for Asteroids.
 * Handles Bullet-Asteroid and Ship-Asteroid collisions using a double-safety approach:
 * A) Unique pair processing (entityA < entityB)
 * B) Verification that entities still exist before processing.
 * Utilizes the world CommandBuffer for deferred mutations and EventBus for deferred events.
 * @public
 */
export class AsteroidCollisionSystem extends System<AsteroidsComponentRegistry, AsteroidsEventRegistry> {
  private static readonly ASTEROID_EXPLOSION_COLORS = ["#ff66cc", "#ff9ee0", "#ffd6f0", "#ffffff"] as const;
  private static readonly SHIP_EXPLOSION_COLORS = ["#00f0ff", "#5cf2ff", "#ff5d00", "#ffffff"] as const;

  private processedDeaths = new Set<number>();
  private destroyedEntities = new Set<number>();

  // Rollback-safe per-tick player session cache
  private playerCache = new Map<string, number>();
  private playerCacheTick = -1;

  constructor() {
    super();
  }

  public override onRegister(world: World<AsteroidsComponentRegistry, AsteroidsEventRegistry>): void {
    const eventBus = world.getEventBus();
    if (eventBus) {
      eventBus.on("combat:death", (event: any) => {
        this.onCombatDeath(world, event);
      });
    }
  }

  private hasEntity(world: World<AsteroidsComponentRegistry, AsteroidsEventRegistry>, entity: number): boolean {
    if (typeof (world as unknown as { hasEntity?: (entity: number) => boolean }).hasEntity === "function") {
      return (world as unknown as { hasEntity: (entity: number) => boolean }).hasEntity(entity);
    }
    return world.hasComponent(entity, "Transform");
  }

  private findPlayerByOwnerId(
    world: World<AsteroidsComponentRegistry, AsteroidsEventRegistry>,
    ownerId: string
  ): number | undefined {
    // Rebuild cache if world tick has changed (e.g., new frame or rollback resimulation)
    if (this.playerCacheTick !== world.tick) {
      this.playerCache.clear();
      this.playerCacheTick = world.tick;

      const ships = world.query("Ship");
      for (let i = 0; i < ships.length; i++) {
        const ent = ships[i];
        const remote = world.getComponent(ent, "RemotePlayer");
        if (remote && remote.sessionId) {
          this.playerCache.set(remote.sessionId, ent);
        }
        const ship = world.getComponent(ent, "Ship");
        if (ship && ship.sessionId) {
          this.playerCache.set(ship.sessionId, ent);
        }
      }

      const remotes = world.query("RemotePlayer");
      for (let i = 0; i < remotes.length; i++) {
        const ent = remotes[i];
        const remote = world.getComponent(ent, "RemotePlayer");
        if (remote && remote.sessionId && !this.playerCache.has(remote.sessionId)) {
          this.playerCache.set(remote.sessionId, ent);
        }
      }
    }

    return this.playerCache.get(ownerId);
  }

  private onCombatDeath(world: World<AsteroidsComponentRegistry, AsteroidsEventRegistry>, event: any): void {
    const asteroid = event.entity;
    const bullet = event.sourceEntity;

    if (this.processedDeaths.has(asteroid)) {
      return;
    }
    this.processedDeaths.add(asteroid);

    if (!world.hasComponent(asteroid, "Asteroid")) {
      return;
    }

    const asteroidComp = world.getComponent(asteroid, "Asteroid");
    const size = (asteroidComp?.size || "large") as "large" | "medium" | "small";

    let points = 20;
    if (size === "medium") points = 50;
    else if (size === "small") points = 100;

    const config = world.getResource<any>("GameConfig") || {};
    // TODO(refactor): código duplicado detectado (bloque) con space-invaders/systems/SpaceInvadersCollisionSystem.ts:153-161. Considerar extraer a función compartida. Ref: 76e7c40a
    let nextCombo = 0;
    let nextMultiplier = 1;

    const comboEntities = world.query("Combo");
    const comboEntity = comboEntities[0];
    if (comboEntity !== undefined) {
      world.mutateComponent(comboEntity, "Combo", (c) => {
        c.combo++;
        c.timerRemaining = (config.COMBO_TIMEOUT ?? 2000) / 1000;
        c.multiplier = Math.min(config.MAX_MULTIPLIER ?? 10, 1 + Math.floor(c.combo / 5));
        nextCombo = c.combo;
        nextMultiplier = c.multiplier;
      });
    }

    const scoreGain = points * nextMultiplier;
    let newScore = scoreGain;
    world.mutateSingleton("GameState", (state) => {
        state.score += scoreGain;
        newScore = state.score;
    });

    // Score synchronization logic by owner
    if (bullet !== undefined && world.hasComponent(bullet, "Bullet")) {
      const bulletComp = world.getComponent(bullet, "Bullet");
      const ownerId = bulletComp?.ownerId;
      if (ownerId) {
          const playerEntity = this.findPlayerByOwnerId(world, ownerId);

          if (playerEntity !== undefined) {
              if (!world.hasComponent(playerEntity, "PlayerScore")) {
                  world.getCommandBuffer().addComponent(playerEntity, {
                      type: "PlayerScore",
                      score: scoreGain
                  });
              } else {
                  world.mutateComponent(playerEntity, "PlayerScore", (ps) => {
                      ps.score = (ps.score || 0) + scoreGain;
                  });
              }
          }
      }
    }

    const asteroidTransform = world.getComponent(asteroid, "Transform");
    if (asteroidTransform) {
      const gameState = world.getSingleton("GameState");
      const isStory = gameState?.mode === "story";
      const level = gameState?.level ?? 1;

      if (isStory && size === "large" && world.gameplayRandom.next() < 0.1) {
        const logs = getLogsForLevel(level);
        if (logs && logs.length > 0) {
          const logIndex = world.gameplayRandom.nextInt(0, logs.length);
          const logText = logs[logIndex];
          spawnScorePopup(world, asteroidTransform.x, asteroidTransform.y - 20, logText, "#00FFDD");
        }
      }

      spawnScorePopup(world, asteroidTransform.x, asteroidTransform.y, `x${nextMultiplier}`, "#FFFF00");
    }

    // Spawn particles
    const particlePool = world.getResource<any>("ParticlePool");
    if (asteroidTransform && particlePool) {
      const ax = asteroidTransform.x;
      const ay = asteroidTransform.y;
      const particleCount = size === "large" ? 24 : (size === "medium" ? 16 : 10);
      const rng = world.gameplayRandom;
      const colors = AsteroidCollisionSystem.ASTEROID_EXPLOSION_COLORS;
      for (let i = 0; i < particleCount; i++) {
        const angle = rng.next() * Math.PI * 2;
        const speed = rng.nextRange(40, 150);
        const px = ax + (rng.next() - 0.5) * 8;
        const py = ay + (rng.next() - 0.5) * 8;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        const color = colors[rng.nextInt(0, colors.length)];
        const pSize = rng.nextRange(1.5, 4.5);
        const ttl = rng.nextRange(0.4, 0.9);
        createSharedParticle(world, px, py, vx, vy, color, particlePool, pSize, ttl);
      }
    }

    // Fragment asteroid
    fragmentAsteroid(world, asteroid);

    // Remove entity
    world.getCommandBuffer().removeEntity(asteroid);

    // Emit deferred events
    const eventBus = world.getEventBus();
    if (eventBus) {
        eventBus.emitDeferred("asteroid:destroyed", { entity: asteroid, size });
        eventBus.emitDeferred("score:changed", { newScore, delta: scoreGain });
    }
  }

  public update(world: World<AsteroidsComponentRegistry, AsteroidsEventRegistry>, _deltaTime: number): void {
    if (world.getResource("IsPaused") === true) return;
    this.processedDeaths.clear();
    // Safe for determinism/rollback. Reusing instance Set avoids per-tick heap allocations during collision updates.
    this.destroyedEntities.clear();
    // Paso 4: Double-security collision resolution system
    const entities = world.query("CollisionEvents");
    const len = entities.length;

    // 1. Iterate over collision pairs with zero-allocation indexed loop
    for (let i = 0; i < len; i++) {
      const entityA = entities[i];
      const colComp = world.getComponent(entityA, "CollisionEvents");
      if (!colComp) {
        continue;
      }

      for (const collision of colComp.collisions) {
        const entityB = collision.otherEntity;

        // Doble Seguridad A: Procesa cada par solo una vez verificando if (entityA < entityB)
        if (!(entityA < entityB)) {
          continue;
        }

        // Doble Seguridad B: Antes de procesar la colisión, verifica que las entidades sigan existiendo
        if (!this.hasEntity(world, entityA) || !this.hasEntity(world, entityB)) {
          continue;
        }

        // Ensure we don't process if either entity was already destroyed in this system update
        if (this.destroyedEntities.has(entityA) || this.destroyedEntities.has(entityB)) {
          continue;
        }

        const isBulletA = world.hasComponent(entityA, "Bullet");
        const isBulletB = world.hasComponent(entityB, "Bullet");
        const isAsteroidA = world.hasComponent(entityA, "Asteroid");
        const isAsteroidB = world.hasComponent(entityB, "Asteroid");
        const isShipA = world.hasComponent(entityA, "Ship");
        const isShipB = world.hasComponent(entityB, "Ship");

        // Case 1: Bullet-Asteroid
        if ((isBulletA && isAsteroidB) || (isBulletB && isAsteroidA)) {
            const bullet   = isBulletA ? entityA : entityB;
            const asteroid = isBulletA ? entityB : entityA;

            if (this.destroyedEntities.has(bullet) || this.destroyedEntities.has(asteroid)) continue;

            // If CombatSystem has already processed this, it will have marked the asteroid as Dead
            // or the bullet would be removed. Otherwise, we are running in direct/headless mode,
            // so we manually trigger the combat death reaction to maintain 100% backward compatibility.
            const health = world.getComponent(asteroid, "Health");
            const isDeadPending = health && health.current <= 0;
            if (!world.hasComponent(asteroid, "Dead") && !isDeadPending) {
              this.onCombatDeath(world, { entity: asteroid, sourceEntity: bullet });
              world.getCommandBuffer().removeEntity(bullet);
              this.destroyedEntities.add(bullet);
              this.destroyedEntities.add(asteroid);
            }
            continue;
        }

        // Case 2: Ship-Asteroid
        if ((isShipA && isAsteroidB) || (isShipB && isAsteroidA)) {
          const ship = isShipA ? entityA : entityB;
          const asteroid = isShipA ? entityB : entityA;

          if (this.destroyedEntities.has(ship) || this.destroyedEntities.has(asteroid)) {
            continue;
          }

          // Ignore collision if ship is invulnerable
          if (world.hasComponent(ship, "Invulnerable")) {
            continue;
          }

          let lives = 0;
          // Decrement lives in game state
          world.mutateSingleton("GameState", (state) => {
            state.lives = Math.max(0, state.lives - 1);
            lives = state.lives;
            if (state.lives <= 0) {
              state.isGameOver = true;
            }
          });

          // Reset combo on player hit/life loss
          if (world.hasComponent(ship, "Combo")) {
            world.mutateComponent(ship, "Combo", (c) => {
              c.combo = 0;
              c.multiplier = 1;
              c.timerRemaining = 0;
            });
          } else {
            const comboEntities = world.query("Combo");
            const comboEntity = comboEntities[0];
            if (comboEntity !== undefined) {
              world.mutateComponent(comboEntity, "Combo", (c) => {
                c.combo = 0;
                c.multiplier = 1;
                c.timerRemaining = 0;
              });
            }
          }

          // Spawn particle explosion for player ship impact/death
          const shipTransform = world.getComponent(ship, "Transform");
          const shipParticlePool = world.getResource<any>("ParticlePool");
          if (shipTransform && shipParticlePool) {
            const sx = shipTransform.x;
            const sy = shipTransform.y;
            const rng = world.gameplayRandom;
            const colors = AsteroidCollisionSystem.SHIP_EXPLOSION_COLORS;
            for (let i = 0; i < 24; i++) {
              const angle = rng.next() * Math.PI * 2;
              const speed = rng.nextRange(60, 200);
              const vx = Math.cos(angle) * speed;
              const vy = Math.sin(angle) * speed;
              const color = colors[rng.nextInt(0, colors.length)];
              const pSize = rng.nextRange(2.0, 5.5);
              const ttl = rng.nextRange(0.5, 1.2);
              createSharedParticle(world, sx, sy, vx, vy, color, shipParticlePool, pSize, ttl);
            }
          }

          if (lives > 0) {
            // Respawn ship at center with invulnerability
            const screen = world.getResource<{ width: number; height: number }>("ScreenConfig") || { width: 800, height: 600 };
            world.mutateComponent(ship, "Transform", (t) => {
              t.x = screen.width / 2;
              t.y = screen.height / 2;
            });
            world.mutateComponent(ship, "Velocity", (v) => {
              v.vx = 0;
              v.vy = 0;
            });
            world.getCommandBuffer().addComponent(ship, {
              type: "Invulnerable",
              remaining: 3.0
            });
          } else {
            // Modificaciones Diferidas: TODA eliminación debe hacerse con world.getCommandBuffer().removeEntity(entity)
            world.getCommandBuffer().removeEntity(ship);
            this.destroyedEntities.add(ship);
          }

          // Eventos Diferidos: Todo evento debe emitirse con eventBus.emitDeferred()
          const eventBus = world.getEventBus();
          if (eventBus) {
            eventBus.emitDeferred("ship:destroyed", { entity: ship });
          }
        }
      }
    }
  }
  public dispose(): void {}
}
