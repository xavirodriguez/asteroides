import { World } from "@tiny-aster/core";
import { ArcadeEntityBuilder } from "../builders/ArcadeEntityBuilder";

describe("ArcadeEntityBuilder", () => {
  it("should create entity with core and arcade components (PowerUp and Collider2D)", () => {
    const world = new World<any>();
    const entity = ArcadeEntityBuilder.create(world)
      .withTransform({ x: 50, y: 75 })
      .withVelocity({ vx: 10, vy: 0 })
      .withRender({ shape: "powerup", size: 16 })
      .withCollider2D({
        shape: { type: "aabb", halfWidth: 8, halfHeight: 8 },
        isTrigger: true
      })
      .withCollisionEvents()
      .withPowerUp("speed_boost")
      .build();

    expect(world.hasEntity(entity)).toBe(true);
    expect(world.hasComponent(entity, "Transform")).toBe(true);
    expect(world.hasComponent(entity, "Velocity")).toBe(true);
    expect(world.hasComponent(entity, "Render")).toBe(true);
    expect(world.hasComponent(entity, "Collider2D")).toBe(true);
    expect(world.hasComponent(entity, "CollisionEvents")).toBe(true);
    expect(world.hasComponent(entity, "PowerUp")).toBe(true);

    const powerUp = world.getComponent(entity, "PowerUp");
    expect(powerUp?.powerUpType).toBe("speed_boost");

    const collider2D = world.getComponent(entity, "Collider2D");
    expect(collider2D?.isTrigger).toBe(true);
    expect(collider2D?.shape).toEqual({ type: "aabb", halfWidth: 8, halfHeight: 8 });
  });
});
