import { World, SystemPhase, CollisionSystem2D, MovementSystem, HierarchySystem, EventBus, TransformComponent } from "@tiny-aster/core";
import { SpaceInvadersInputSystem } from "../systems/SpaceInvadersInputSystem";
import { SpaceInvadersCollisionSystem } from "../systems/SpaceInvadersCollisionSystem";
import { CombatSystem } from "@tiny-aster/gameplay-kit";
import { PlayerBulletPool, ParticlePool } from "../EntityPool";
import { SpaceInvadersComponentRegistry } from "../types/SpaceInvadersTypes";
import { EnemyFactory } from "../EnemyFactory";
import { CollisionLayers } from "@tiny-aster/gameplay-kit";

describe("Space Invaders Shooting & Collision Integration", () => {
  let world: World<SpaceInvadersComponentRegistry>;
  let playerBulletPool: PlayerBulletPool;
  let particlePool: ParticlePool;
  let inputSystem: SpaceInvadersInputSystem;

  beforeEach(() => {
    world = new World<SpaceInvadersComponentRegistry>();
    const eventBus = new EventBus<any>();
    world.setResource("EventBus", eventBus);

    const mockConfig = {
      KEYS: { LEFT: "ArrowLeft", RIGHT: "ArrowRight", SHOOT: "Space" },
      PLAYER_SPEED: 300,
      PLAYER_INITIAL_LIVES: 3,
      PLAYER_SHOOT_COOLDOWN: 100,
      PLAYER_RENDER_WIDTH: 40,
      PLAYER_COLLIDER_RADIUS: 18,
      PLAYER_BULLET_SPEED: 400,
      PLAYER_BULLET_SIZE: 4,
      PLAYER_BULLET_TTL: 2000,
      PARTICLE_COUNT: 5,
      COMBO_TIMEOUT: 2000,
      MAX_MULTIPLIER: 5,
      SCREEN_WIDTH: 800,
      SCREEN_HEIGHT: 600,
    };
    world.setResource("GameConfig", mockConfig);

    playerBulletPool = new PlayerBulletPool();
    particlePool = new ParticlePool();

    world.setResource("PlayerBulletPool", playerBulletPool);
    world.setResource("ParticlePool", particlePool);
    world.setResource("IsHeadless", true);

    inputSystem = new SpaceInvadersInputSystem(playerBulletPool);

    world.addSystem(inputSystem, { phase: SystemPhase.Simulation });
    world.addSystem(new MovementSystem(), { phase: SystemPhase.Simulation });
    world.addSystem(new HierarchySystem(), { phase: SystemPhase.Transform });
    world.addSystem(new CollisionSystem2D(), { phase: SystemPhase.Collision });
    world.addSystem(new CombatSystem(), { phase: SystemPhase.Collision });
    world.addSystem(new SpaceInvadersCollisionSystem(particlePool), { phase: SystemPhase.GameRules });

    // Create GameState
    const stateEntity = world.createEntity();
    world.addComponent(stateEntity, {
      type: "GameState",
      lives: 3,
      score: 0,
      level: 1,
      invadersRemaining: 0,
      isGameOver: false,
      readyRemaining: 0,
      intermissionRemaining: 0,
      continueCountdownRemaining: 0,
    } as any);
  });

  function createPlayerEntity(x = 400, y = 500) {
    const player = world.createEntity();
    world.addComponent(player, { type: "Player" } as any);
    world.addComponent(player, { type: "Transform", x, y, rotation: 0, scaleX: 1, scaleY: 1 } as any);
    world.addComponent(player, { type: "Velocity", vx: 0, vy: 0, angularVelocity: 0 } as any);
    world.addComponent(player, { type: "Input", moveLeft: false, moveRight: false, shoot: false, shootCooldownRemaining: 0 } as any);
    world.addComponent(player, {
      type: "Collider",
      shape: { type: 0, radius: 18 },
      layer: CollisionLayers.PLAYER,
      mask: CollisionLayers.ENEMY | CollisionLayers.DEBRIS,
      offsetX: 0, offsetY: 0, isTrigger: false, enabled: true
    } as any);
    world.addComponent(player, {
      type: "CollisionEvents",
      collisions: [], activeTriggers: [], triggersEntered: [], triggersExited: []
    } as any);
    world.addComponent(player, { type: "Health", current: 3, max: 3 } as any);
    world.addComponent(player, { type: "Faction", faction: "player" } as any);
    return player;
  }

  it("spawns a visible player bullet on shoot input and enforces single active bullet limit", () => {
    const player = createPlayerEntity(400, 500);

    // Set shoot input on player's Input component
    world.mutateComponent(player, "Input", (input) => {
      input.shoot = true;
    });

    world.update(0.016);

    // Query active player bullets
    const bullets = world.query("PlayerBullet", "Render", "Transform");
    expect(bullets.length).toBe(1);

    const bulletEntity = bullets[0];
    const render = world.getComponent(bulletEntity, "Render");
    expect(render?.visible).toBe(true);
    expect(render?.opacity).toBe(1);
    expect(render?.shape).toBe("player_bullet");

    // Try firing again on next frame - should still be 1 bullet because activeBullets.length === 1
    world.mutateComponent(player, "Input", (input) => {
      input.shoot = true;
      input.shootCooldownRemaining = 0; // force cooldown to 0
    });

    world.update(0.016);
    const bulletsAfter = world.query("PlayerBullet");
    expect(bulletsAfter.length).toBe(1);
  });

  it("handles end-to-end bullet flight, physical collision with invader, damage, and reclamation", () => {
    const player = createPlayerEntity(400, 500);

    // Create an Invader directly in the bullet's path above player
    // Player is at (400, 500), bullet spawns at (400, 475) moving dy = -400.
    // Place invader at (400, 400).
    const invader = EnemyFactory.createEnemy(world, "invader_scout", 400, 400);
    world.addComponent(invader, { type: "Invader", row: 1, col: 1, points: 20 } as any);

    // Verify Invader collider layer
    const invaderCollider = world.getComponent(invader, "Collider");
    expect(invaderCollider?.layer).toBe(CollisionLayers.ENEMY);

    // Fire bullet
    world.mutateComponent(player, "Input", (input) => {
      input.shoot = true;
    });

    world.update(0.016); // InputSystem spawns bullet at (400, 475)

    const bullets = world.query("PlayerBullet", "Transform");
    expect(bullets.length).toBe(1);

    // Release shoot input so player doesn't auto-fire again immediately
    world.mutateComponent(player, "Input", (input) => {
      input.shoot = false;
    });

    // Update simulation enough ticks for bullet at dy = -400 to reach y = 400 and overlap invader
    // Distance = 75px. Speed = 400px/s. Time = ~0.2s (13 frames at 16ms).
    for (let i = 0; i < 20; i++) {
      world.update(0.016);
      world.gameplayRandom.unlock();
      try {
        world.getEventBus()?.flushDeferred();
      } finally {
        world.gameplayRandom.lock();
      }
    }
    // Extra tick for deferred command buffer flush
    world.update(0.016);

    // Invader should be destroyed
    const remainingInvaders = world.query("Invader");
    expect(remainingInvaders.length).toBe(0);

    // Player bullet should be reclaimed/destroyed
    const remainingBullets = world.query("PlayerBullet");
    expect(remainingBullets.length).toBe(0);

    // GameState score should be updated (20 points for invader)
    const gameState = world.getSingleton("GameState");
    expect(gameState?.score).toBe(20);

    // Player should now be able to fire a new bullet after cooldown
    world.mutateComponent(player, "Input", (input) => {
      input.shoot = true;
      input.shootCooldownRemaining = 0;
    });

    world.update(0.016);
    const newBullets = world.query("PlayerBullet", "Render");
    expect(newBullets.length).toBe(1);

    // Verify the recycled bullet from the pool is fully visible
    const newRender = world.getComponent(newBullets[0], "Render");
    expect(newRender?.visible).toBe(true);
    expect(newRender?.opacity).toBe(1);
  });
});
