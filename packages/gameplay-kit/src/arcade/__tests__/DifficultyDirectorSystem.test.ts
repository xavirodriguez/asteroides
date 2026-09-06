import { World, SystemPhase } from "@tiny-aster/core";
import { DifficultyDirectorSystem } from "../systems/DifficultyDirectorSystem";

describe("DifficultyDirectorSystem", () => {
  let world: World<any>;
  let directorSystem: DifficultyDirectorSystem;

  beforeEach(() => {
    world = new World<any>();
    directorSystem = new DifficultyDirectorSystem();
    world.addSystem(directorSystem, { phase: SystemPhase.GameRules });

    // Set up default GameConfig
    world.setResource("GameConfig", {
      INVADER_SPEED: 50,
      INVADER_SPEED_X: 50,
      ENEMY_FIRE_INTERVAL_MIN: 1000,
      ENEMY_FIRE_INTERVAL_MAX: 3000,
      BALL_SPEED_BASE: 300
    });

    // Create default GameState
    const stateEntity = world.createEntity();
    world.addComponent(stateEntity, {
      type: "GameState",
      lives: 3,
      level: 1,
      isGameOver: false
    } as any);

    // Create default Combo
    const comboEntity = world.createEntity();
    world.addComponent(comboEntity, {
      type: "Combo",
      combo: 0,
      multiplier: 1,
      timerRemaining: 0,
      timerDuration: 2.0
    } as any);
  });

  it("should calculate baseline difficulty tension and keep config unchanged in normal conditions", () => {
    world.update(0.016);

    const tension = world.getResource("DifficultyTension");
    expect(tension).toBeCloseTo(0.5);

    const config = world.getResource<any>("GameConfig");
    expect(config.INVADER_SPEED).toBe(50);
    expect(config.ENEMY_FIRE_INTERVAL_MIN).toBe(1000);
  });

  it("should increase tension and adjust config variables upwards when combo multiplier is high", () => {
    // Set combo multiplier to 3
    const comboEntity = world.query("Combo" as any)[0];
    world.mutateComponent(comboEntity, "Combo" as any, (c: any) => {
      c.multiplier = 3;
    });

    world.update(0.016);

    const tension = world.getResource<number>("DifficultyTension");
    expect(tension).toBeGreaterThan(0.5); // Tension should rise

    const config = world.getResource<any>("GameConfig");
    // Speed should be higher than baseline (50)
    expect(config.INVADER_SPEED).toBeGreaterThan(50);
    // Enemy fire interval should be shorter than baseline (1000)
    expect(config.ENEMY_FIRE_INTERVAL_MIN).toBeLessThan(1000);
  });

  it("should decrease tension and adjust config variables downwards when player lives are low", () => {
    // Set lives to 1
    const stateEntity = world.query("GameState" as any)[0];
    world.mutateComponent(stateEntity, "GameState" as any, (gs: any) => {
      gs.lives = 1;
    });

    world.update(0.016);

    const tension = world.getResource<number>("DifficultyTension");
    expect(tension).toBeLessThan(0.5); // Tension should fall

    const config = world.getResource<any>("GameConfig");
    // Speed should be slower than baseline (50)
    expect(config.INVADER_SPEED).toBeLessThan(50);
    // Enemy fire interval should be longer than baseline (1000)
    expect(config.ENEMY_FIRE_INTERVAL_MIN).toBeGreaterThan(1000);
  });
});
