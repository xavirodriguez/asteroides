import { World } from "@tiny-aster/core";
import { PowerUpRegistry, PowerUpSystem } from "../index";

describe("PowerUpRegistry & PowerUpSystem", () => {
  it("should initialize with common power-up effects by default", () => {
    const registry = new PowerUpRegistry();
    expect(registry.has("speed_boost")).toBe(true);
    expect(registry.has("shield")).toBe(true);
    expect(registry.has("extra_life")).toBe(true);
    expect(registry.has("score_multiplier")).toBe(true);
  });

  it("should allow registering custom power-up effects", () => {
    const registry = new PowerUpRegistry();
    const mockEffect = { apply: jest.fn() };
    registry.register("custom_powerup", mockEffect);

    expect(registry.has("custom_powerup")).toBe(true);
    expect(registry.get("custom_powerup")).toBe(mockEffect);
  });

  it("should apply effect on player collision and queue removal of power-up entity", () => {
    const world = new World<any>();
    const registry = new PowerUpRegistry();
    const applySpy = jest.fn();
    registry.register("test_effect", { apply: applySpy });

    world.setResource("PowerUpEffects", registry);

    const player = world.createEntity();
    world.addComponent(player, { type: "LocalPlayer" });

    const powerUp = world.createEntity();
    world.addComponent(powerUp, { type: "PowerUp", powerUpType: "test_effect", duration: 10 });
    world.addComponent(powerUp, {
      type: "CollisionEvents",
      collisions: [{ otherEntity: player }],
      activeTriggers: [],
      triggersEntered: [],
      triggersExited: []
    });

    const system = new PowerUpSystem();
    system.update(world, 0.016);

    expect(applySpy).toHaveBeenCalledWith(world, player);

    // Verify command buffer queued removal
    world.getCommandBuffer().flush(world);
    expect(world.hasEntity(powerUp)).toBe(false);
  });

  it("should log warning and destroy power-up when effect is not found (no fallback)", () => {
    const world = new World<any>();
    const registry = new PowerUpRegistry(); // does not have 'unknown_effect'
    world.setResource("PowerUpEffects", registry);

    const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    const player = world.createEntity();
    world.addComponent(player, { type: "LocalPlayer" });

    const powerUp = world.createEntity();
    world.addComponent(powerUp, { type: "PowerUp", powerUpType: "unknown_effect", duration: 10 });
    world.addComponent(powerUp, {
      type: "CollisionEvents",
      collisions: [{ otherEntity: player }],
      activeTriggers: [],
      triggersEntered: [],
      triggersExited: []
    });

    const system = new PowerUpSystem();
    system.update(world, 0.016);

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "[PowerUpSystem] No power-up effect registered for type: 'unknown_effect'"
    );

    world.getCommandBuffer().flush(world);
    expect(world.hasEntity(powerUp)).toBe(false);

    consoleWarnSpy.mockRestore();
  });
});
