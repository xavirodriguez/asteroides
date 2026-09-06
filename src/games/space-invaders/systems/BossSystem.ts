import { System, World, HealthComponent, EventBus, TransformComponent, RenderComponent, Component, ColliderComponent, CircleShape, ShapeType, CollisionEventsComponent } from "@tiny-aster/core";
import { GameStateComponent, BossComponent, SpaceInvadersComponentRegistry, SpaceInvadersEventRegistry, GAME_CONFIG } from "../types/SpaceInvadersTypes";
import { FactionComponent, spawnScorePopup } from "@tiny-aster/gameplay-kit";
import { SpaceInvadersConfig } from "../types/SpaceInvadersConfigSchema";
import { createEmitter } from "@tiny-aster/core";
import { CollisionLayers } from "@tiny-aster/gameplay-kit";
import { Juice } from "@tiny-aster/core";
import { spawnLayeredExplosion } from "../rendering/SpaceInvadersCanvasVisuals";

export class BossSystem extends System<SpaceInvadersComponentRegistry, SpaceInvadersEventRegistry> {
  private config?: SpaceInvadersConfig;

  public override onRegister(world: World<SpaceInvadersComponentRegistry, SpaceInvadersEventRegistry>): void {
    const eventBus = world.getEventBus();
    if (eventBus) {
      eventBus.on("si:kill", (event: { chain: number }) => {
        if (world.isReSimulating) return;
        const bosses = world.query("Boss");
        for (const entity of bosses) {
          world.mutateComponent(entity, "Boss", b => {
            const currentFury = b.fury ?? 0;
            if (event && event.chain >= 5) {
              b.fury = Math.min(100, currentFury + 40);
              b.furyDuration = 3.0; // 3 seconds of fury
            }
          });
        }
      });

      eventBus.on("entity:destroyed", (event: { type: string }) => {
        if (world.isReSimulating) return;
        if (event && event.type === "Shield") {
          const bosses = world.query("Boss");
          for (const entity of bosses) {
            world.mutateComponent(entity, "Boss", b => {
              b.counterFirePending = true;
            });
          }
        }
      });
    }
  }

  // TODO(refactor): código duplicado detectado (método) con space-invaders/systems/SpaceInvadersFormationSystem.ts:21-30. Considerar extraer a función compartida. Ref: d157968e
  public update(world: World<SpaceInvadersComponentRegistry>, deltaTime: number): void {
    if (world.getResource("IsPaused") === true) return;
    if (!this.config) {
        this.config = world.getResource<SpaceInvadersConfig>("GameConfig")!;
    }
    const gameState = world.getSingleton("GameState");
    if (!gameState || gameState.isGameOver) return;
    if (gameState.readyRemaining > 0 || gameState.intermissionRemaining > 0 || gameState.continueCountdownRemaining > 0) return;

    const bosses = world.query("Boss", "Transform", "Render");
    bosses.forEach(entity => {
      const boss = world.getComponent(entity, "Boss")!;
      const pos = world.getComponent(entity, "Transform")!;

      world.mutateComponent(entity, "Boss", b => {
          b.timer += deltaTime;

          if (b.furyDuration && b.furyDuration > 0) {
            b.furyDuration -= deltaTime;
            if (b.furyDuration <= 0) {
              b.fury = Math.max(0, (b.fury ?? 0) - 20);
              if ((b.fury ?? 0) > 0) {
                b.furyDuration = 1.0;
              }
            }
          }
      });

      const isFurious = (boss.fury ?? 0) > 50;
      const speedMultiplier = isFurious ? 2.0 : 1.0;

      // Side to side movement (with furious multiplier)
      world.mutateComponent(entity, "Transform", p => {
          p.x = GAME_CONFIG.SCREEN_WIDTH / 2 + Math.sin(boss.timer / 1000) * 200 * speedMultiplier;
          p.dirty = true;
      });

      // Phase changes
      world.mutateComponent(entity, "Boss", b => {
          const hpPercent = b.hp / b.maxHp;
          if (hpPercent < 0.33) b.phase = 3;
          else if (hpPercent < 0.66) b.phase = 2;
          else b.phase = 1;
      });

      // Counter firing reactive to shield destruction
      if (boss.counterFirePending) {
         createEmitter(world, {
            type: "shoot",
            x: pos.x,
            y: pos.y + 40,
            rate: 0,
            burst: true,
            count: 15,
            color: ["#FF0000", "#FF00FF"],
            size: [4, 8],
            speed: [150, 250],
            angle: [160, 200],
            lifetime: [1.0, 1.5],
            loop: false
         });
         world.mutateComponent(entity, "Boss", b => {
            b.counterFirePending = false;
         });
      }

      // Shooting patterns
      if (Math.floor(boss.timer / 1000) % 2 === 0 && Math.floor((boss.timer - deltaTime) / 1000) % 2 !== 0) {
         // Burst effect when "shooting"
         createEmitter(world, {
            type: "shoot",
            x: pos.x,
            y: pos.y + 40,
            rate: 0,
            burst: true,
            count: isFurious ? 20 : 10,
            color: ["#FF00FF", "#00FFFF"],
            size: [3, 6],
            speed: [100, 200],
            angle: [0, 360],
            lifetime: [0.5, 1.0],
            loop: false
         });
      }

      if (boss.hp <= 0) {
        this.destroyBoss(world, entity);
      }
    });

  }

  private destroyBoss(world: World<SpaceInvadersComponentRegistry>, entity: number): void {
    const pos = world.getComponent(entity, "Transform")!;
    createEmitter(world, {
        type: "explosion",
        x: pos.x,
        y: pos.y,
        rate: 0,
        burst: true,
        count: 50,
        color: ["#FF00FF", "#FFFFFF", "#FFFF00"],
        size: [4, 10],
        speed: [50, 300],
        angle: [0, 360],
        lifetime: [1.0, 2.0],
        loop: false
    });
    if (!world.isReSimulating) {
      spawnLayeredExplosion(pos.x, pos.y, "#FF00FF", 2.2); // Intense boss explosion
    }
    Juice.shake(world, 10, 1000);
    spawnScorePopup(world, pos.x, pos.y, "+5000", "#FFD700");

    world.mutateSingleton("GameState", gs => {
        gs.score += 5000;
    });

    const eventBus = world.getEventBus();
    if (eventBus) eventBus.emitDeferred("si:boss_defeated", {});

    world.getCommandBuffer().removeEntity(entity);
  }
}
