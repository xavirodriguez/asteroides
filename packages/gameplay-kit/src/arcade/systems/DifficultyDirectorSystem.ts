import { System, World, ComponentRegistry } from "@tiny-aster/core";

/**
 * System that dynamically adjusts game difficulty parameters based on real-time player performance
 * to maintain an engaging, balanced "tension" level without feeling unfair.
 * @public
 */
export class DifficultyDirectorSystem<TComponents extends ComponentRegistry = ComponentRegistry> extends System<TComponents> {
  public update(world: World<TComponents>, _deltaTime: number): void {
    if (world.getResource("IsPaused") === true) return;
    // 1. Read performance metrics
    const comboEntity = world.query("Combo" as any)[0];
    const comboComp = comboEntity !== undefined
      ? (world.getComponent(comboEntity, "Combo" as any) as any)
      : undefined;

    const gameState = world.getSingleton("GameState" as any) as any;
    if (!gameState || gameState.isGameOver) return;

    const multiplier = comboComp?.multiplier ?? 1;
    const lives = gameState.lives ?? 3;
    const level = gameState.level ?? 1;

    // 2. Compute Tension (0.1 to 0.9, baseline is 0.5)
    let tension = 0.5;

    // High combo multiplier increases tension
    if (multiplier > 1) {
      tension += Math.min(0.4, (multiplier - 1) * 0.08);
    }

    // Low lives reduces tension to give the player a break
    if (lives === 1) {
      tension -= 0.25;
    } else if (lives === 2) {
      tension -= 0.10;
    }

    // Progression slightly increases tension
    tension += Math.min(0.2, (level - 1) * 0.05);

    // Clamp tension safely
    tension = Math.max(0.1, Math.min(0.9, tension));

    // Store calculated tension in world resource so UI can optionally visualize it
    world.setResource("DifficultyTension", tension);

    // 3. Dynamically adjust GameConfig based on tension
    const config = world.getResource<Record<string, unknown>>("GameConfig");
    if (config) {
      const newConfig = { ...config };

      // Symmetrical multipliers centered around neutral tension (0.5)
      const speedMultiplier = 0.6 + (tension - 0.1) * 1.0;          // 0.6 to 1.4
      const fireIntervalMultiplier = 1.4 - (tension - 0.1) * 1.0;   // 1.4 to 0.6
      const lootDropMultiplier = Number((0.6 + (tension - 0.1) * 1.0).toFixed(2)); // Single source of truth for loot drop scaling (0.6x to 1.4x)

      newConfig.LOOT_DROP_MULTIPLIER = lootDropMultiplier;

      // Space Invaders Adjustments
      if (typeof newConfig.INVADER_SPEED === "number") {
        const baseline = 50; // default INVADER_SPEED_BASE
        newConfig.INVADER_SPEED = Math.round(baseline * speedMultiplier);
      }
      if (typeof newConfig.INVADER_SPEED_X === "number") {
        const baseline = 50;
        newConfig.INVADER_SPEED_X = Math.round(baseline * speedMultiplier);
      }
      if (typeof newConfig.ENEMY_FIRE_INTERVAL_MIN === "number") {
        const baselineMin = 1000;
        const baselineMax = 3000;
        newConfig.ENEMY_FIRE_INTERVAL_MIN = Math.round(baselineMin * fireIntervalMultiplier);
        if (typeof newConfig.ENEMY_FIRE_INTERVAL_MAX === "number") {
          newConfig.ENEMY_FIRE_INTERVAL_MAX = Math.round(baselineMax * fireIntervalMultiplier);
        }
      }

      // Pong Adjustments
      if (typeof newConfig.BALL_SPEED_BASE === "number") {
        const baseline = 300;
        newConfig.BALL_SPEED_BASE = Math.round(baseline * speedMultiplier);
      }

      world.setResource("GameConfig", newConfig);
    }
  }

  public override dispose(): void {}
}
