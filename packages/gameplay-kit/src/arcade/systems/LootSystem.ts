import { System, World, CoreComponentRegistry } from "@tiny-aster/core";
import { LootTableComponent } from "../types/ArcadeTypes";

/** @public */
export class LootSystem extends System<CoreComponentRegistry & { LootTable: LootTableComponent }> {
  public update(world: World<CoreComponentRegistry & { LootTable: LootTableComponent }>, _deltaTime: number): void {
    if (world.getResource("IsPaused") === true) return;
    const lootType = "LootTable" as Extract<keyof (CoreComponentRegistry & { LootTable: LootTableComponent }), string>;
    const transformType = "Transform" as Extract<keyof (CoreComponentRegistry & { LootTable: LootTableComponent }), string>;
    const entities = world.query(lootType, transformType);

    for (const entity of entities) {
      const loot = world.getComponent(entity, lootType) as LootTableComponent | undefined;
      const transform = world.getComponent(entity, transformType) as any;

      if (!loot || !transform) continue;

      const isDead = world.hasComponent(entity, "Dead" as any);
      const ttl = world.getComponent(entity, "TTL");
      const isTTLExpired = ttl !== undefined && ttl.remaining <= 0;

      if (isDead || isTTLExpired) {
        const config = world.getResource<Record<string, unknown>>("GameConfig");
        const lootMultiplier = typeof config?.LOOT_DROP_MULTIPLIER === "number" ? config.LOOT_DROP_MULTIPLIER : 1.0;

        const customDrops = (loot as any).drops as Array<{ type: string; chance: number; config?: Record<string, unknown> }> | undefined;
        if (customDrops && Array.isArray(customDrops) && customDrops.length > 0) {
          for (const drop of customDrops) {
            const effectiveChance = drop.chance * lootMultiplier;
            if (world.gameplayRandom.next() < effectiveChance) {
              const eventBus = world.getEventBus();
              if (eventBus) {
                eventBus.emit("loot:spawn", {
                  x: transform.x,
                  y: transform.y,
                  lootType: drop.type,
                  config: drop.config
                } as never);
              }
              break; // Limit to 1 item drop per entity
            }
          }
        } else {
          const registry = world.getResource<Record<string, Array<{ type: string; weight: number }>>>("LootTables") || {
            default: [
              { type: "speed_boost", weight: 30 },
              { type: "shield", weight: 20 },
              { type: "extra_life", weight: 10 },
              { type: "score_multiplier", weight: 40 }
            ]
          };

          const table = registry[loot.tableId] || registry["default"];
          if (table && table.length > 0) {
            const totalWeight = table.reduce((sum: number, item: { weight: number }) => sum + item.weight, 0);
            const roll = world.gameplayRandom.range(0, totalWeight);

            let currentSum = 0;
            let selectedType: string | null = null;
            for (const item of table) {
              currentSum += item.weight;
              if (roll <= currentSum) {
                selectedType = item.type;
                break;
              }
            }

            if (selectedType && selectedType !== "none") {
              const eventBus = world.getEventBus();
              if (eventBus) {
                eventBus.emit("loot:spawn", {
                  x: transform.x,
                  y: transform.y,
                  lootType: selectedType
                } as never);
              }
            }
          }
        }
      }
    }
  }
}
