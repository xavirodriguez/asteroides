import { World } from "../src/ecs/World";
import { CoreComponentRegistry, RunState, HitboxComponent, HurtboxComponent, EnemyComponent } from "../src/ecs/CoreComponents";
import { EventBus } from "../src/events/EventBus";
import { SystemPhase } from "../src/ecs/System";
import { CollisionSystem2D } from "../src/physics/collision/CollisionSystems";
import { CollectibleSystem } from "../src/systems/CollectibleSystem";
import { HitDetectionSystem } from "../src/systems/HitDetectionSystem";
import { ShapeType } from "../src/physics/shapes/Shapes";

describe("Collision pipeline — CollectibleSystem & HitDetectionSystem", () => {
  let world: World<CoreComponentRegistry>;
  let eventBus: EventBus;
  let runState: RunState;

  beforeEach(() => {
    world = new World<CoreComponentRegistry>();
    eventBus = new EventBus();
    world.setResource("EventBus", eventBus);
    runState = {
      attempt: 1,
      lives: 3,
      activeCheckpoint: null,
      elapsedTime: 0,
      deaths: 0,
      collectedPermanentIds: [],
      collectedTemporalIds: []
    };
    world.setResource("RunState", runState);

    world.addSystem(new CollisionSystem2D(), { phase: SystemPhase.Collision });
    world.addSystem(new CollectibleSystem(), { phase: SystemPhase.Collision });
    world.addSystem(new HitDetectionSystem(), { phase: SystemPhase.Collision });
  });

  it("collects a fragment when player overlaps after CollisionSystem2D fills CollisionEvents", () => {
    const player = world.createEntity();
    world.addComponent(player, {
      type: "Transform",
      x: 100, y: 100, rotation: 0, scaleX: 1, scaleY: 1,
      worldX: 100, worldY: 100, worldRotation: 0, worldScaleX: 1, worldScaleY: 1, dirty: false
    });
    world.addComponent(player, {
      type: "Collider2D",
      shape: { type: "aabb", halfWidth: 10, halfHeight: 15 },
      layer: 1,
      mask: 0xffff,
      offsetX: 0, offsetY: 0,
      isTrigger: false,
      enabled: true
    });
    world.addComponent(player, {
      type: "CollisionEvents",
      collisions: [],
      activeTriggers: [],
      triggersEntered: [],
      triggersExited: []
    });
    world.addComponent(player, {
      type: "PlatformerInput",
      moveDir: 0, jumpPressed: false, jumpHeld: false, jumpReleased: false
    });

    const fragment = world.createEntity();
    world.addComponent(fragment, {
      type: "Transform",
      x: 105, y: 100, rotation: 0, scaleX: 1, scaleY: 1,
      worldX: 105, worldY: 100, worldRotation: 0, worldScaleX: 1, worldScaleY: 1, dirty: false
    });
    world.addComponent(fragment, {
      type: "Collider2D",
      shape: { type: "aabb", halfWidth: 8, halfHeight: 8 },
      layer: 1 << 5,
      mask: 1,
      offsetX: 0, offsetY: 0,
      isTrigger: true,
      enabled: true
    });
    world.addComponent(fragment, {
      type: "CollisionEvents",
      collisions: [],
      activeTriggers: [],
      triggersEntered: [],
      triggersExited: []
    });
    world.addComponent(fragment, {
      type: "Collectible",
      kind: "fragment",
      value: 10,
      persistent: false,
      collectOnce: false,
      id: "frag_test_1"
    });

    // Run a few frames so CollisionSystem2D populates triggers and CollectibleSystem reacts
    for (let i = 0; i < 3; i++) {
      world.update(1 / 60);
    }
    eventBus.flushDeferred();

    expect(runState.collectedTemporalIds).toContain("frag_test_1");
    expect(world.hasEntity(fragment)).toBe(false);
  });

  it("emits hitbox:hit when pulse trigger overlaps enemy Collider2D hurtbox", () => {
    const player = world.createEntity();
    world.addComponent(player, {
      type: "Transform",
      x: 50, y: 50, rotation: 0, scaleX: 1, scaleY: 1,
      worldX: 50, worldY: 50, worldRotation: 0, worldScaleX: 1, worldScaleY: 1, dirty: false
    });
    world.addComponent(player, {
      type: "PlatformerInput",
      moveDir: 0, jumpPressed: false, jumpHeld: false, jumpReleased: false
    });

    const pulse = world.createEntity();
    world.addComponent(pulse, {
      type: "Transform",
      x: 80, y: 50, rotation: 0, scaleX: 1, scaleY: 1,
      worldX: 80, worldY: 50, worldRotation: 0, worldScaleX: 1, worldScaleY: 1,
      dirty: false,
      parentEntity: player
    });
    world.addComponent(pulse, {
      type: "Collider2D",
      shape: { type: "aabb", halfWidth: 15, halfHeight: 15 },
      layer: 1 << 3,
      mask: 1 << 4,
      offsetX: 0, offsetY: 0,
      isTrigger: true,
      enabled: true
    });
    world.addComponent(pulse, {
      type: "CollisionEvents",
      collisions: [],
      activeTriggers: [],
      triggersEntered: [],
      triggersExited: []
    });
    const hitboxComp: HitboxComponent = { type: "Hitbox", hitEntities: [] };
    world.addComponent(pulse, hitboxComp);

    const enemy = world.createEntity();
    world.addComponent(enemy, {
      type: "Transform",
      x: 85, y: 50, rotation: 0, scaleX: 1, scaleY: 1,
      worldX: 85, worldY: 50, worldRotation: 0, worldScaleX: 1, worldScaleY: 1, dirty: false
    });
    world.addComponent(enemy, {
      type: "Collider2D",
      shape: { type: "aabb", halfWidth: 12, halfHeight: 12 },
      layer: 1 << 4,
      mask: 0xffff,
      offsetX: 0, offsetY: 0,
      isTrigger: false,
      enabled: true
    });
    world.addComponent(enemy, {
      type: "CollisionEvents",
      collisions: [],
      activeTriggers: [],
      triggersEntered: [],
      triggersExited: []
    });
    const hurtboxComp: HurtboxComponent = { type: "Hurtbox" };
    const enemyComp: EnemyComponent = { type: "Enemy", kind: "patrol" };
    world.addComponent(enemy, hurtboxComp);
    world.addComponent(enemy, enemyComp);
    world.addComponent(enemy, { type: "Health", current: 1, max: 1 });

    let hitPayload: any = null;
    eventBus.on("hitbox:hit", (payload) => {
      hitPayload = payload;
    });

    for (let i = 0; i < 3; i++) {
      world.update(1 / 60);
    }
    eventBus.flushDeferred();

    expect(hitPayload).not.toBeNull();
    expect(hitPayload.attacker).toBe(player);
    expect(hitPayload.victim).toBe(enemy);
    expect(hitPayload.hurtboxEntity).toBe(enemy);
  });
});
