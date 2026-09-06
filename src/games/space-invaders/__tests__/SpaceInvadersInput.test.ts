import { World, SystemPhase, EventBus, TransformComponent } from "@tiny-aster/core";
import { SpaceInvadersInputSystem } from "../systems/SpaceInvadersInputSystem";
import { MovementSystem, CollisionSystem2D, HierarchySystem } from "@tiny-aster/core";
import { CombatSystem } from "@tiny-aster/gameplay-kit";
import { SpaceInvadersCollisionSystem } from "../systems/SpaceInvadersCollisionSystem";
import { SpaceInvadersComponentRegistry } from "../types/SpaceInvadersTypes";
import { PlayerBulletPool, ParticlePool } from "../EntityPool";

describe("Space Invaders Player Shooting & Input System with Collision", () => {
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
      PLAYER_SHOOT_COOLDOWN: 500,
      PLAYER_BULLET_SPEED: 500,
      PLAYER_BULLET_SIZE: 4,
      PLAYER_BULLET_TTL: 2000,
      PLAYER_COLLIDER_RADIUS: 15,
      PARTICLE_COUNT: 8,
      PARTICLE_TTL_BASE: 500,
    };
    world.setResource("GameConfig", mockConfig);

    playerBulletPool = new PlayerBulletPool();
    particlePool = new ParticlePool();
    world.setResource("PlayerBulletPool", playerBulletPool);
    world.setResource("ParticlePool", particlePool);

    inputSystem = new SpaceInvadersInputSystem(playerBulletPool);
    world.addSystem(inputSystem, { phase: SystemPhase.Simulation });
    world.addSystem(new MovementSystem(), { phase: SystemPhase.Simulation });
    world.addSystem(new HierarchySystem(), { phase: SystemPhase.Transform });
    world.addSystem(new CollisionSystem2D(), { phase: SystemPhase.Collision });
    world.addSystem(new CombatSystem(), { phase: SystemPhase.Collision });
    world.addSystem(new SpaceInvadersCollisionSystem(particlePool), { phase: SystemPhase.GameRules });
  });

  it("should spawn a player bullet, move it upwards, and NOT destroy it immediately upon spawning", () => {
    // 1. Create GameState
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

    // 2. Create InputState singleton
    const inputState = world.createEntity();
    world.addComponent(inputState, {
      type: "InputState",
      buttons: { shoot: true },
      axes: {}
    } as any);

    // 3. Create Player entity
    const player = world.createEntity();
    world.addComponent(player, { type: "Player" } as any);
    world.addComponent(player, { type: "Transform", x: 100, y: 500, rotation: 0, scaleX: 1, scaleY: 1 } as any);
    world.addComponent(player, { type: "Velocity", vx: 0, vy: 0, angularVelocity: 0 } as any);
    world.addComponent(player, { type: "Input", moveLeft: false, moveRight: false, shoot: false, shootCooldownRemaining: 0 } as any);
    world.addComponent(player, {
      type: "Collider",
      shape: { type: 0, radius: 15 }, // Circle
      layer: 1, // PLAYER
      mask: 2 | 8, // ENEMY | DEBRIS
      offsetX: 0, offsetY: 0, isTrigger: false, enabled: true
    } as any);
    world.addComponent(player, {
      type: "CollisionEvents",
      collisions: [], activeTriggers: [], triggersEntered: [], triggersExited: []
    } as any);
    world.addComponent(player, { type: "Health", current: 3, max: 3 } as any);
    world.addComponent(player, { type: "Faction", faction: "player" } as any);

    // Run first update to process shooting and spawn bullet
    world.update(0.016);

    // Verify player bullet was created and added to the world
    const bullets = world.query("PlayerBullet");
    expect(bullets.length).toBe(1);

    const bulletEntity = bullets[0];
    const initialTransform = world.getComponent(bulletEntity, "Transform") as TransformComponent;
    expect(initialTransform).toBeDefined();
    expect(initialTransform.y).toBe(475);

    // Run another update to verify movement and that it is still alive and has moved
    world.update(0.016);

    const bulletsAfter = world.query("PlayerBullet");
    expect(bulletsAfter.length).toBe(1);
    expect(world.getComponent(bulletEntity, "Transform")!.y).toBeLessThan(475);
  });
});
