import { World, CoreComponentRegistry } from "@tiny-aster/core";
import { PowerUpEffectRegistry, COMMON_POWERUP_EFFECTS, IPowerUpEffect } from "../powerups/PowerUpEffectRegistry";
import { PowerUpSystem } from "../systems/PowerUpSystem";
import { PowerUpComponent } from "../types/ArcadeTypes";

type TestComponentRegistry = CoreComponentRegistry & {
  PowerUp: PowerUpComponent;
  Invulnerable: { type: "Invulnerable"; remaining: number };
  PlatformerJumper: { type: "PlatformerJumper"; maxJumps: number; jumpsRemaining: number };
  GameState: { type: "GameState"; lives?: number; score?: number };
};

describe("PowerUpEffectRegistry", () => {
  let world: World<TestComponentRegistry, any>;

  beforeEach(() => {
    world = new World<TestComponentRegistry, any>();
  });

  it("should initialize with default common power-up effects", () => {
    const registry = new PowerUpEffectRegistry();
    expect(registry.has("speed_boost")).toBe(true);
    expect(registry.has("shield")).toBe(true);
    expect(registry.has("extra_life")).toBe(true);
    expect(registry.has("score_multiplier")).toBe(true);
    expect(registry.has("double_jump")).toBe(true);
    expect(registry.has("dash_unlock")).toBe(true);
    expect(registry.has("wall_jump_unlock")).toBe(true);
  });

  it("should allow registering custom effects or overriding existing ones", () => {
    const registry = new PowerUpEffectRegistry();
    let customApplied = false;

    const customEffect: IPowerUpEffect = {
      apply: () => {
        customApplied = true;
      }
    };

    registry.register("custom_effect", customEffect);
    expect(registry.has("custom_effect")).toBe(true);

    const retrieved = registry.get("custom_effect");
    retrieved?.apply(world, 1);
    expect(customApplied).toBe(true);
  });

  it("should apply speed_boost effect correctly", () => {
    const registry = new PowerUpEffectRegistry();
    const player = world.createEntity();
    world.addComponent(player, { type: "Velocity", vx: 100, vy: 50, angularVelocity: 0 });

    const effect = registry.get("speed_boost");
    effect?.apply(world, player);

    const vel = world.getComponent(player, "Velocity");
    expect(vel?.vx).toBe(150);
    expect(vel?.vy).toBe(75);
  });

  it("should apply shield effect correctly", () => {
    const registry = new PowerUpEffectRegistry();
    const player = world.createEntity();

    const effect = registry.get("shield");
    effect?.apply(world, player);
    world.getCommandBuffer().flush(world);

    const inv = world.getComponent(player, "Invulnerable");
    expect(inv?.remaining).toBe(5.0);
  });

  it("should integrate seamlessly with PowerUpSystem via world resource", () => {
    const registry = new PowerUpEffectRegistry();
    registry.attachToWorld(world);

    const powerUpSystem = new PowerUpSystem();

    const player = world.createEntity();
    world.addComponent(player, { type: "LocalPlayer" } as any);
    world.addComponent(player, { type: "Velocity", vx: 10, vy: 10, angularVelocity: 0 });

    const powerUpEntity = world.createEntity();
    world.addComponent(powerUpEntity, {
      type: "PowerUp",
      powerUpType: "speed_boost"
    });
    world.addComponent(powerUpEntity, {
      type: "CollisionEvents",
      collisions: [{ otherEntity: player, normalX: 0, normalY: 0 }]
    } as any);

    powerUpSystem.update(world as any, 0.016);

    const vel = world.getComponent(player, "Velocity");
    expect(vel?.vx).toBe(15);
    expect(vel?.vy).toBe(15);
  });
});
