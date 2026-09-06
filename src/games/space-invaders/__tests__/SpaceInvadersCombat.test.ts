import { World, SystemPhase, CollisionEventsComponent, HealthComponent, EventBus, TransformComponent, RenderComponent, Entity } from "@tiny-aster/core";
import { SpaceInvadersCollisionSystem } from "../systems/SpaceInvadersCollisionSystem";
import { CombatSystem } from "@tiny-aster/gameplay-kit";
import { SpaceInvadersComponentRegistry } from "../types/SpaceInvadersTypes";
import { ParticlePool, EnemyBulletPool, PlayerBulletPool } from "../EntityPool";

describe("Space Invaders Pilot Combat Integration", () => {
  let world: World<SpaceInvadersComponentRegistry>;
  let particlePool: ParticlePool;
  let playerBulletPool: PlayerBulletPool;
  let enemyBulletPool: EnemyBulletPool;

  beforeEach(() => {
    world = new World<SpaceInvadersComponentRegistry>();

    const eventBus = new EventBus<any>();
    world.setResource("EventBus", eventBus);

    const mockConfig = {
      KEYS: { LEFT: "ArrowLeft", RIGHT: "ArrowRight", SHOOT: "Space" },
      PLAYER_INITIAL_LIVES: 3,
      PLAYER_BULLET_SPEED: 500,
      PLAYER_BULLET_SIZE: 4,
      PLAYER_BULLET_TTL: 2000,
      ENEMY_BULLET_SPEED: 250,
      ENEMY_BULLET_SIZE: 4,
      ENEMY_BULLET_TTL: 3000,
      PARTICLE_COUNT: 8,
      COMBO_TIMEOUT: 2000,
      MAX_MULTIPLIER: 5,
    };
    world.setResource("GameConfig", mockConfig);

    particlePool = new ParticlePool();
    playerBulletPool = new PlayerBulletPool();
    enemyBulletPool = new EnemyBulletPool();

    world.setResource("ParticlePool", particlePool);
    world.setResource("PlayerBulletPool", playerBulletPool);
    world.setResource("EnemyBulletPool", enemyBulletPool);

    // Register systems
    world.addSystem(new CombatSystem(), { phase: SystemPhase.Collision });
    world.addSystem(new SpaceInvadersCollisionSystem(particlePool), { phase: SystemPhase.GameRules });
  });

  it("should damage player when hit by enemy bullet and update lives & invulnerability", () => {
    // 1. Create GameState
    const stateEntity = world.createEntity();
    world.addComponent(stateEntity, {
      type: "GameState",
      lives: 3,
      score: 0,
      level: 1,
      invadersRemaining: 0,
      isGameOver: false,
      screenShake: null,
      kamikazesActive: 0,
    } as any);

    // 2. Create Player
    const player = world.createEntity();
    world.addComponent(player, { type: "Player" } as any);
    world.addComponent(player, { type: "Transform", x: 100, y: 100 } as any);
    world.addComponent(player, { type: "Render", hitFlashFrames: 0, visible: true, opacity: 1, order: 0 } as any);
    world.addComponent(player, { type: "Health", current: 3, max: 3, invulnerableRemaining: 0 } as any);
    world.addComponent(player, { type: "Faction", faction: "player", value: "player" } as any);

    // 3. Acquire enemy bullet from pool near player
    const bullet = enemyBulletPool.acquire(world, {
      x: 100,
      y: 100,
      dx: 0,
      dy: 100,
      size: 4,
      color: "red",
      ttl: 2000
    });

    // 4. Trigger mock collision
    world.addComponent(player, {
      type: "CollisionEvents",
      collisions: [{ otherEntity: bullet, normalX: 0, normalY: 0, depth: 0, contactPoints: [] }],
      activeTriggers: [], triggersEntered: [], triggersExited: []
    } as any);
    world.addComponent(bullet, {
      type: "CollisionEvents",
      collisions: [{ otherEntity: player, normalX: 0, normalY: 0, depth: 0, contactPoints: [] }],
      activeTriggers: [], triggersEntered: [], triggersExited: []
    } as any);

    // Execute update tick
    world.update(0.016);
    world.gameplayRandom.unlock();
    try {
      world.getEventBus()?.flushDeferred();
    } finally {
      world.gameplayRandom.lock();
    }

    // Check Player health is decremented
    const health = world.getComponent(player, "Health");
    expect(health?.current).toBe(2);
    expect(health?.invulnerableRemaining).toBe(1.5);

    // Check GameState lives is synchronized and screenshake applied
    const state = world.getComponent(stateEntity, "GameState" as any) as any;
    expect(state.lives).toBe(2);
    expect(state.screenShake).toEqual({ intensity: 10, duration: 0.3, elapsed: 0, totalDuration: 0.3 });

    // Check player bullet hit flash
    const render = world.getComponent(player, "Render");
    expect(render?.hitFlashFrames).toBe(10);
  });

  it("should damage boss when hit by player bullet and trigger particle explosion", () => {
    // 1. Create GameState
    const stateEntity = world.createEntity();
    world.addComponent(stateEntity, {
      type: "GameState",
      lives: 3,
      score: 0,
      level: 1,
      invadersRemaining: 0,
      isGameOver: false,
      screenShake: null,
      kamikazesActive: 0,
    } as any);

    // 2. Create Boss
    const boss = world.createEntity();
    world.addComponent(boss, { type: "Boss", hp: 10, maxHp: 10, timer: 0, phase: 1 } as any);
    world.addComponent(boss, { type: "Transform", x: 200, y: 100 } as any);
    world.addComponent(boss, { type: "Render", hitFlashFrames: 0, visible: true, opacity: 1, order: 0 } as any);
    world.addComponent(boss, { type: "Health", current: 10, max: 10 } as any);
    world.addComponent(boss, { type: "Faction", faction: "enemy", value: "enemy" } as any);

    // 3. Acquire player bullet near boss
    const bullet = playerBulletPool.acquire(world, {
      x: 200,
      y: 100,
      dx: 0,
      dy: -100,
      size: 4,
      color: "green",
      ttl: 2000
    });

    // 4. Trigger collision events
    world.addComponent(boss, {
      type: "CollisionEvents",
      collisions: [{ otherEntity: bullet, normalX: 0, normalY: 0, depth: 0, contactPoints: [] }],
      activeTriggers: [], triggersEntered: [], triggersExited: []
    } as any);
    world.addComponent(bullet, {
      type: "CollisionEvents",
      collisions: [{ otherEntity: boss, normalX: 0, normalY: 0, depth: 0, contactPoints: [] }],
      activeTriggers: [], triggersEntered: [], triggersExited: []
    } as any);

    // Execute update tick
    world.update(0.016);
    world.gameplayRandom.unlock();
    try {
      world.getEventBus()?.flushDeferred();
    } finally {
      world.gameplayRandom.lock();
    }

    // Check boss health is decremented
    const health = world.getComponent(boss, "Health");
    expect(health?.current).toBe(9);

    // Check Boss hp is synchronized
    const bossComp = world.getComponent(boss, "Boss" as any) as any;
    expect(bossComp.hp).toBe(9);

    // Check score is incremented
    const state = world.getComponent(stateEntity, "GameState" as any) as any;
    expect(state.score).toBe(100);

    // Check particles were created
    const particles = world.query("Reclaimable" as any);
    expect(particles.length).toBeGreaterThan(0);
  });
});
