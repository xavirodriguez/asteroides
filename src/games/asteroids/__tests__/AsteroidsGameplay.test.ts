import { World, computeShipPhysics } from "@tiny-aster/core";
import { CollisionLayers } from "@tiny-aster/gameplay-kit";
import { AsteroidsGame } from "../AsteroidsGame";
import { createShip, createAsteroid, createBullet, fragmentAsteroid } from "../EntityFactory";

describe("Asteroids Gameplay, Physics & Collision Systems", () => {
  let game: AsteroidsGame;
  let world: World<any, any, any>;

  beforeEach(async () => {
    game = new AsteroidsGame({ headless: true });
    await game.init();
    world = game.getWorld();
    world.gameplayRandom.unlock(); // Unlock for testing convenience

    // Clear all initially spawned entities to prevent collision flakiness in tests
    const initialAsteroids = world.query("Asteroid");
    for (const entity of initialAsteroids) {
      world.getCommandBuffer().removeEntity(entity);
    }
    const initialShips = world.query("Ship");
    for (const entity of initialShips) {
      world.getCommandBuffer().removeEntity(entity);
    }
    world.getCommandBuffer().flush(world); // Flush command buffer síncronamente sin bloquear gameplayRandom
  });

  afterEach(() => {
    game.destroy();
  });

  describe("AsteroidInputSystem Shooting", () => {
    it("should allow shooting multiple times with appropriate cooldown", () => {
      // Create a player ship first
      const shipEntity = createShip({ world, x: 100, y: 100 });
      // Spawn a placeholder asteroid far away to prevent wave spawning
      createAsteroid({ world, x: 700, y: 700, size: "large" });

      world.addComponent(shipEntity, { type: "LocalPlayer" });
      world.addComponent(shipEntity, {
          type: "Input",
          actions: { shoot: true },
          axes: {}
      });
      world.flush();

      // Find the local player ship
      const ships = world.query("LocalPlayer", "Ship", "Input");
      expect(ships.length).toBe(1);

      // Update once - should spawn a bullet
      world.update(0.016);
      world.flush();

      let bullets = world.query("Bullet");
      expect(bullets.length).toBe(1);

      // Verify cooldown is set
      let shipComp = world.getComponent(shipEntity, "Ship") as any;
      expect(shipComp.shootCooldownRemaining).toBeGreaterThan(0.2);

      // Update multiple times to decrement cooldown (0.25 seconds / 0.016 ~ 16 frames)
      // Since shoot = true is held, it should automatically fire a second bullet once cooldown <= 0
      for (let i = 0; i < 20; i++) {
        world.update(0.016);
        world.flush();
      }

      // Should have successfully spawned the second bullet automatically
      bullets = world.query("Bullet");
      expect(bullets.length).toBe(2);
    });

    it("should align bullet rotation with ship rotation even if ship has non-zero velocity", () => {
      // Create ship and set its rotation and velocity
      const shipEntity = createShip({ world, x: 100, y: 100 });
      world.addComponent(shipEntity, { type: "LocalPlayer" });
      world.addComponent(shipEntity, {
          type: "Input",
          actions: { shoot: true },
          axes: {}
      });

      world.mutateComponent(shipEntity, "Transform", (t: any) => {
        t.rotation = Math.PI / 4; // 45 degrees
      });
      world.mutateComponent(shipEntity, "Velocity", (v: any) => {
        v.vx = 200; // Ship is moving fast horizontally
        v.vy = 0;
      });

      world.flush();

      // Clear shoot cooldown
      world.mutateComponent(shipEntity, "Ship", (s: any) => {
        s.shootCooldownRemaining = 0;
      });

      // Update once - should spawn a bullet
      world.update(0.016);
      world.flush();

      const bullets = world.query("Bullet");
      expect(bullets.length).toBe(1);

      const bulletTransform = world.getComponent(bullets[0], "Transform") as any;
      expect(bulletTransform.rotation).toBeCloseTo(Math.PI / 4, 5); // Must match transform.rotation (45 deg)

      // Calculate what atan2(vy, vx) would have been:
      // bullet vx = velocity.vx + cos(rotation) * bulletSpeed = 200 + cos(PI/4) * 300 = 200 + 212.13 = 412.13
      // bullet vy = velocity.vy + sin(rotation) * bulletSpeed = 0 + sin(PI/4) * 300 = 212.13
      // atan2(212.13, 412.13) = 0.474 rad (approx 27 degrees), not 45 degrees!
      const bulletVelocity = world.getComponent(bullets[0], "Velocity") as any;
      const expectedAtan2 = Math.atan2(bulletVelocity.vy, bulletVelocity.vx);
      expect(bulletTransform.rotation).not.toBeCloseTo(expectedAtan2, 3);
    });
  });

  describe("computeShipPhysics", () => {
    it("should correctly rotate ship clockwise and counter-clockwise", () => {
      const transform = { rotation: 0 };
      const velocity = { vx: 0, vy: 0 };
      const config = { SHIP_THRUST: 150, SHIP_ROTATION_SPEED: 4.0, SHIP_FRICTION: 0.5 };

      // Rotate Right
      let result = computeShipPhysics(transform, velocity, { actions: new Set(["rotateRight"]), axes: {} }, config, 0.1);
      expect(result.rotation).toBeCloseTo(0.4, 4);

      // Rotate Left
      result = computeShipPhysics(transform, velocity, { actions: new Set(["rotateLeft"]), axes: {} }, config, 0.1);
      expect(result.rotation).toBeCloseTo(-0.4, 4);
    });

    it("should apply thrust based on ship rotation and handle friction", () => {
      const transform = { rotation: 0 }; // cos(0) = 1, sin(0) = 0
      const velocity = { vx: 0, vy: 0 };
      const config = { SHIP_THRUST: 100, SHIP_ROTATION_SPEED: 4.0, SHIP_FRICTION: 1.0 };

      // Apply thrust for 0.1 seconds
      const result = computeShipPhysics(transform, velocity, { actions: new Set(["thrust"]), axes: {} }, config, 0.1);
      // ax = cos(0)*100 = 100. vx_pre = ax*0.1 = 10. vx_post = 10 * (1 - 1.0*0.1) = 9
      expect(result.vx).toBeCloseTo(9, 4);
      expect(result.vy).toBe(0);
    });
  });

  describe("EntityFactory & Pools", () => {
    it("should create a ship with all required components", () => {
      const ship = createShip({ world, x: 100, y: 200 });
      expect(world.hasEntity(ship)).toBe(true);
      expect(world.getComponent(ship, "Transform")).toBeDefined();
      expect(world.getComponent(ship, "Velocity")).toBeDefined();
      expect(world.getComponent(ship, "Render")).toBeDefined();
      expect(world.getComponent(ship, "Health")).toBeDefined();
      expect(world.getComponent(ship, "Collider")).toBeDefined();
      expect(world.getComponent(ship, "CollisionEvents")).toBeDefined();
      expect(world.getComponent(ship, "Boundary")).toBeDefined();
    });

    it("should create a bullet with appropriate TTL and Collider components", () => {
      const bullet = createBullet({ world, x: 100, y: 200, vx: 50, vy: -50, ownerId: "player" });
      expect(world.hasEntity(bullet)).toBe(true);

      const ttl = world.getComponent(bullet, "TTL") as any;
      expect(ttl).toBeDefined();
      expect(ttl.remaining).toBe(2.0); // default BULLET_TTL from AsteroidConfigSchema is 2.0

      const collider = world.getComponent(bullet, "Collider") as any;
      expect(collider).toBeDefined();
      expect(collider.layer).toBe(CollisionLayers.PROJECTILE);
      expect(collider.mask).toBe(CollisionLayers.ENEMY);
    });

    it("should fragment a large asteroid into two medium asteroids deterministically", () => {
      const largeAsteroid = createAsteroid({ world, x: 100, y: 100, size: "large" });

      // Trigger fragmentation
      fragmentAsteroid(world, largeAsteroid);

      // Verify two medium asteroids were created
      const asteroids = world.query("Asteroid");
      const mediumAsteroids = asteroids.filter(id => {
        const a = world.getComponent(id, "Asteroid") as any;
        return a.size === "medium";
      });

      expect(mediumAsteroids.length).toBe(2);
      // Clean up parent
      world.getCommandBuffer().removeEntity(largeAsteroid);
    });
  });

  describe("AsteroidCollisionSystem & Invulnerability", () => {
    it("should resolve bullet and asteroid collisions by destroying the bullet and splitting the asteroid", () => {
      const bullet = createBullet({ world, x: 100, y: 100, vx: 0, vy: 0 });
      const asteroid = createAsteroid({ world, x: 100, y: 100, size: "large" });

      // Simulate Collision event
      const eventsComp = world.getComponent(bullet, "CollisionEvents") as any;
      eventsComp.collisions.push({
        otherEntity: asteroid,
        normalX: 0,
        normalY: 0,
        depth: 0,
        contactPoints: []
      });

      // Update world (runs collision and gameState systems)
      world.update(0.016);

      // Commands execution is deferred, verify they are requested for removal
      expect(world.hasEntity(bullet)).toBe(false);
      expect(world.hasEntity(asteroid)).toBe(false);

      // Verify score is updated
      const state = game.getGameState();
      expect(state.score).toBe(20); // 20 points for large asteroid
    });

    it("should ignore lethal ship-asteroid collisions if ship is invulnerable", () => {
      const ship = createShip({ world, x: 100, y: 100 });
      const asteroid = createAsteroid({ world, x: 100, y: 100, size: "large" });

      // Make ship invulnerable
      world.addComponent(ship, {
        type: "Invulnerable",
        remaining: 3.0
      } as any);

      // Add collision event to ship
      const eventsComp = world.getComponent(ship, "CollisionEvents") as any;
      eventsComp.collisions.push({
        otherEntity: asteroid,
        normalX: 0,
        normalY: 0,
        depth: 0,
        contactPoints: []
      });

      // Update
      world.update(0.016);

      // Ship should NOT be destroyed and its lives should still be intact
      expect(world.hasEntity(ship)).toBe(true);
      const state = game.getGameState();
      expect(state.lives).toBe(3); // lives remain 3
    });

    it("should decrement life and respawn ship when hit by asteroid without invulnerability", () => {
      const ship = createShip({ world, x: 100, y: 100 });
      const asteroid = createAsteroid({ world, x: 100, y: 100, size: "large" });

      // Verify ship is NOT invulnerable initially
      expect(world.hasComponent(ship, "Invulnerable" as any)).toBe(false);

      // Add collision event to ship
      const eventsComp = world.getComponent(ship, "CollisionEvents") as any;
      eventsComp.collisions.push({
        otherEntity: asteroid,
        normalX: 0,
        normalY: 0,
        depth: 0,
        contactPoints: []
      });

      // Update
      world.update(0.016);

      // Ship should be moved to center and be marked as invulnerable
      const transform = world.getComponent(ship, "Transform") as any;
      const screen = world.getResource<{ width: number; height: number }>("ScreenConfig") || { width: 800, height: 600 };
      expect(transform.x).toBe(screen.width / 2);
      expect(transform.y).toBe(screen.height / 2);

      expect(world.hasComponent(ship, "Invulnerable" as any)).toBe(true);

      const state = game.getGameState();
      expect(state.lives).toBe(2); // lives decremented from 3 to 2
    });
  });

  describe("AsteroidGameStateSystem", () => {
    it("should advance level and spawn next wave when all asteroids are cleared", () => {
      // Clear initially spawned asteroids
      const initialAsteroids = world.query("Asteroid");
      for (const entity of initialAsteroids) {
        world.getCommandBuffer().removeEntity(entity);
      }

      // Tick world to process deferred removals
      world.update(0.016);
      // Tick again to detect 0 asteroids and spawn next wave
      world.update(0.016);

      // Verify level advanced and next wave is spawned
      const state = game.getGameState();
      expect(state.level).toBe(2);

      const newAsteroids = world.query("Asteroid");
      // Initial asteroid count is 5. For level 2, it should spawn (5 + (2 - 1)) = 6 asteroids.
      expect(newAsteroids.length).toBe(6);
    });
  });

  describe("Asteroids Combo System Logic", () => {
    it("should initialize with 0 combo and 1x multiplier", () => {
      const ship = createShip({ world, x: 500, y: 500 });
      world.flush();

      const comboComp = world.getComponent(ship, "Combo" as any) as any;
      expect(comboComp).toBeDefined();
      expect(comboComp.combo).toBe(0);
      expect(comboComp.multiplier).toBe(1);

      const state = game.getGameState();
      expect(state.combo).toBe(0);
      expect(state.multiplier).toBe(1);
    });

    it("should increment combo and multiply score on asteroid destruction", () => {
      const ship = createShip({ world, x: 500, y: 500 });
      const bullet = createBullet({ world, x: 100, y: 100, vx: 0, vy: 0, ownerId: "player" });
      const asteroid = createAsteroid({ world, x: 100, y: 100, size: "small" }); // small worth 100 points
      world.flush();

      // Trigger bullet-asteroid collision
      const eventsComp = world.getComponent(bullet, "CollisionEvents") as any;
      eventsComp.collisions.push({
        otherEntity: asteroid,
        normalX: 0,
        normalY: 0,
        depth: 0,
        contactPoints: []
      });

      world.update(0.016);
      world.flush();

      // Combo component should have combo = 1, multiplier = 1 (1 + floor(1/5) = 1)
      const comboComp = world.getComponent(ship, "Combo" as any) as any;
      expect(comboComp.combo).toBe(1);
      expect(comboComp.multiplier).toBe(1);

      // Score should have updated by points * multiplier (100 * 1 = 100)
      const state = game.getGameState();
      expect(state.score).toBe(100);
      expect(state.combo).toBe(1);
      expect(state.multiplier).toBe(1);
    });

    it("should cap multiplier at MAX_MULTIPLIER", () => {
      const ship = createShip({ world, x: 500, y: 500 });
      world.flush();

      // Manually set combo to 50 (multiplier would be 1 + floor(50/5) = 11, capped at 10)
      world.mutateComponent(ship, "Combo" as any, (c: any) => {
        c.combo = 50;
      });

      const bullet = createBullet({ world, x: 100, y: 100, vx: 0, vy: 0, ownerId: "player" });
      const asteroid = createAsteroid({ world, x: 100, y: 100, size: "small" }); // small worth 100 points
      world.flush();

      const eventsComp = world.getComponent(bullet, "CollisionEvents") as any;
      eventsComp.collisions.push({
        otherEntity: asteroid,
        normalX: 0,
        normalY: 0,
        depth: 0,
        contactPoints: []
      });

      world.update(0.016);
      world.flush();

      const comboComp = world.getComponent(ship, "Combo" as any) as any;
      expect(comboComp.combo).toBe(51);
      expect(comboComp.multiplier).toBe(10); // Capped at 10

      // Score gained is 100 * 10 = 1000
      const state = game.getGameState();
      expect(state.score).toBe(1000);
    });

    it("should decay combo over time", () => {
      const ship = createShip({ world, x: 500, y: 500 });
      world.flush();

      // Set some combo
      world.mutateComponent(ship, "Combo" as any, (c: any) => {
        c.combo = 10;
        c.multiplier = 3;
        c.timerRemaining = 0.05; // 50ms remaining
      });

      // Update world by 0.1s (greater than remaining 0.05s)
      world.update(0.1);
      world.flush();

      const comboComp = world.getComponent(ship, "Combo" as any) as any;
      expect(comboComp.combo).toBe(0);
      expect(comboComp.multiplier).toBe(1);
    });

    it("should reset combo on life loss", () => {
      const ship = createShip({ world, x: 100, y: 100 });
      const asteroid = createAsteroid({ world, x: 100, y: 100, size: "large" });
      world.flush();

      // Set some combo on ship
      world.mutateComponent(ship, "Combo" as any, (c: any) => {
        c.combo = 15;
        c.multiplier = 4;
        c.timerRemaining = 2.0;
      });

      // Trigger ship-asteroid collision
      const eventsComp = world.getComponent(ship, "CollisionEvents") as any;
      eventsComp.collisions.push({
        otherEntity: asteroid,
        normalX: 0,
        normalY: 0,
        depth: 0,
        contactPoints: []
      });

      world.update(0.016);
      world.flush();

      // Ship lives decremented, combo reset to 0
      const state = game.getGameState();
      expect(state.lives).toBe(2);
      expect(state.combo).toBe(0);
      expect(state.multiplier).toBe(1);

      const comboComp = world.getComponent(ship, "Combo" as any) as any;
      expect(comboComp.combo).toBe(0);
      expect(comboComp.multiplier).toBe(1);
    });
  });

  describe("Asteroids Redesigned Hyperspace Logic", () => {
    it("should charge hyperspace while holding key and render a transient preview singularity", () => {
      const ship = createShip({ world, x: 100, y: 100 });
      world.addComponent(ship, { type: "LocalPlayer" });
      world.addComponent(ship, {
        type: "Input",
        actions: { hyperspace: true },
        axes: {}
      } as any);
      // Spawn a placeholder asteroid far away to prevent wave spawning
      createAsteroid({ world, x: 700, y: 700, size: "large" });
      world.flush();

      // Update 1 frame to trigger preparation
      world.update(0.016);
      world.flush();

      const shipComp = world.getComponent(ship, "Ship") as any;
      expect(shipComp.hyperspacePrepTime).toBeCloseTo(0.5, 4); // 0.5 on start
      expect(shipComp.hyperspacePreviewX).toBeDefined();
      expect(shipComp.hyperspacePreviewY).toBeDefined();

      // Verify that a visual preview entity has been created
      const renders = world.query("Render");
      const preview = renders.find(r => {
        const rc = world.getComponent(r, "Render") as any;
        return rc.shape === "singularity";
      });
      expect(preview).toBeDefined();

      const previewTrans = world.getComponent(preview!, "Transform") as any;
      expect(previewTrans.x).toBe(shipComp.hyperspacePreviewX);
      expect(previewTrans.y).toBe(shipComp.hyperspacePreviewY);
    });

    it("should cancel hyperspace charging if key is released", () => {
      const ship = createShip({ world, x: 100, y: 100 });
      world.addComponent(ship, { type: "LocalPlayer" });
      world.addComponent(ship, {
        type: "Input",
        actions: { hyperspace: true },
        axes: {}
      } as any);
      createAsteroid({ world, x: 700, y: 700, size: "large" });
      world.flush();

      // Charge for 1 frame
      world.update(0.016);
      world.flush();

      let shipComp = world.getComponent(ship, "Ship") as any;
      expect(shipComp.hyperspacePrepTime).toBeGreaterThan(0);

      // Release key
      world.mutateComponent(ship, "Input", (inp: any) => {
        inp.actions = {};
      });

      world.update(0.016);
      world.flush();

      shipComp = world.getComponent(ship, "Ship") as any;
      expect(shipComp.hyperspacePrepTime).toBe(0);
      expect(shipComp.hyperspacePreviewX).toBeUndefined();
    });

    it("should teleport ship and apply cooldown when charge completes", () => {
      const ship = createShip({ world, x: 100, y: 100 });
      world.addComponent(ship, { type: "LocalPlayer" });
      world.addComponent(ship, {
        type: "Input",
        actions: { hyperspace: true },
        axes: {}
      } as any);
      createAsteroid({ world, x: 700, y: 700, size: "large" });
      world.flush();

      // Charge for 1 frame to lock destination coordinates
      world.update(0.016);
      world.flush();

      const shipComp = world.getComponent(ship, "Ship") as any;
      const targetX = shipComp.hyperspacePreviewX;
      const targetY = shipComp.hyperspacePreviewY;

      // Charge remaining frames (~31 frames for 0.5s prep time)
      for (let i = 0; i < 32; i++) {
        world.update(0.016);
        world.flush();
      }

      // Teleport complete! Transform matches destination, Velocity is zero, Cooldown is set
      const transform = world.getComponent(ship, "Transform") as any;
      expect(transform.x).toBe(targetX);
      expect(transform.y).toBe(targetY);

      const velocity = world.getComponent(ship, "Velocity") as any;
      expect(velocity.vx).toBe(0);
      expect(velocity.vy).toBe(0);

      const updatedShipComp = world.getComponent(ship, "Ship") as any;
      expect(updatedShipComp.hyperspaceCooldownRemaining).toBeGreaterThan(4.5);
      expect(updatedShipComp.hyperspacePrepTime).toBe(0);
    });
  });

  describe("Asteroids Meta beneficial mutators", () => {
    it("should apply hyper_drift mutator: double thrust and set low friction", () => {
      // Mock GameConfig resource
      const initialConfig = { SHIP_THRUST: 150, FRICTION: 0.99 };
      world.setResource("GameConfig", initialConfig);

      const { BENEFICIAL_MUTATORS } = require("../../../utils/MutatorRegistry");
      BENEFICIAL_MUTATORS.hyper_drift.apply(world);

      const updatedConfig = world.getResource<any>("GameConfig");
      expect(updatedConfig.SHIP_THRUST).toBe(300);
      expect(updatedConfig.FRICTION).toBe(0.95);
    });

    it("should apply bouncing_bullets mutator and spawn bullets with bouncing boundaries", () => {
      const initialConfig = { BULLET_BOUNDARY_BEHAVIOR: "wrap" };
      world.setResource("GameConfig", initialConfig);

      const { BENEFICIAL_MUTATORS } = require("../../../utils/MutatorRegistry");
      BENEFICIAL_MUTATORS.bouncing_bullets.apply(world);

      const updatedConfig = world.getResource<any>("GameConfig");
      expect(updatedConfig.BULLET_BOUNDARY_BEHAVIOR).toBe("bounce");

      // Spawn bullet, should have a Boundary component with mode = bounce
      const bullet = createBullet({ world, x: 100, y: 100, vx: 50, vy: 50 });
      world.flush();

      const boundary = world.getComponent(bullet, "Boundary") as any;
      expect(boundary).toBeDefined();
      expect(boundary.mode).toBe("bounce");
    });
  });
});
