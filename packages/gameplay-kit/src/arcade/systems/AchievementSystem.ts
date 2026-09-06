import { System, World, ComponentRegistry, EventBus } from "@tiny-aster/core";

export interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

const memoryStorage = new Map<string, string>();

export class InMemoryStorageAdapter implements StorageAdapter {
  async getItem(key: string): Promise<string | null> {
    return memoryStorage.get(key) ?? null;
  }
  async setItem(key: string, value: string): Promise<void> {
    memoryStorage.set(key, value);
  }
}

/**
 * Interface representing a player achievement.
 * @public
 */
export interface Achievement {
  id: string;
  name: string;
  description: string;
  unlocked: boolean;
}

/**
 * Shared system that orchestrates and persists cross-game achievements using EventBus.
 * @public
 */
export class AchievementSystem<TComponents extends ComponentRegistry = ComponentRegistry> extends System<TComponents> {
  private storage: StorageAdapter;
  private achievements: Achievement[] = [
    { id: "combo_king", name: "Rey del Combo", description: "Alcanza un combo x10", unlocked: false },
    { id: "invader_slayer", name: "Aniquilador", description: "Destruye 50 invasores", unlocked: false },
    { id: "flappy_pro", name: "As de las Alturas", description: "Pasa 10 tuberías en Flappy Bird", unlocked: false },
    { id: "story_boss_defeated", name: "Héroe de la Galaxia", description: "Derrotar al primer Boss narrativo", unlocked: false },
    { id: "story_all_fragments_c1", name: "Historiador", description: "Recolectar todos los fragmentos del Capítulo 1", unlocked: false }
  ];

  private invadersKilled = 0;
  private asteroidsDestroyed = 0;
  private pipesPassed = 0;
  private collectedFragments: string[] = [];

  constructor(storage?: StorageAdapter) {
    super();
    this.storage = storage ?? new InMemoryStorageAdapter();
  }

  public override onRegister(world: World<TComponents>): void {
    const eventBus = world.getEventBus() as EventBus;
    if (eventBus) {
      // Load saved achievements from persistence
      this.storage.getItem("unlocked_achievements").then((raw) => {
        if (raw) {
          const stored = JSON.parse(raw) as Record<string, boolean>;
          for (const achievement of this.achievements) {
            if (stored[achievement.id]) {
              achievement.unlocked = true;
            }
          }
        }
      }).catch((err: unknown) => {
        console.error("AchievementSystem: Failed to load achievements", err);
      });

      // 1. Listen to 'si:kill' from Space Invaders
      eventBus.on("si:kill", (event: { chain: number }) => {
        if (world.isReSimulating) return;
        if (event && typeof event.chain === "number" && event.chain >= 10) {
          this.unlock(world, "combo_king");
        }
      });

      // 2. Listen to general 'entity:destroyed' (e.g. Space Invaders invaders)
      eventBus.on("entity:destroyed", (event: { type: string }) => {
        if (world.isReSimulating) return;
        if (event && event.type === "Invader") {
          this.invadersKilled++;
          if (this.invadersKilled >= 50) {
            this.unlock(world, "invader_slayer");
          }
        }
      });

      // Listen to asteroid:destroyed from Asteroids
      eventBus.on("asteroid:destroyed", () => {
        if (world.isReSimulating) return;
        this.asteroidsDestroyed++;
        if (this.asteroidsDestroyed >= 50) {
          this.unlock(world, "invader_slayer");
        }

        // Check if player has achieved a combo >= 10
        const combos = world.query("Combo" as any);
        for (const entity of combos) {
          const c = world.getComponent(entity, "Combo" as any) as any;
          if (c && c.combo >= 10) {
            this.unlock(world, "combo_king");
          }
        }
      });

      // 3. Listen to 'pipe:passed' from Flappy Bird
      eventBus.on("pipe:passed", () => {
        if (world.isReSimulating) return;
        this.pipesPassed++;
        if (this.pipesPassed >= 10) {
          this.unlock(world, "flappy_pro");
        }
      });

      // 4. Listen to story:beat_reached
      eventBus.on("story:beat_reached", (event: any) => {
        if (world.isReSimulating) return;
        if (event && event.beatId === "boss_defeated") {
          this.unlock(world, "story_boss_defeated");
        }
      });

      // 5. Listen to CollectiblePickedUp
      eventBus.on("CollectiblePickedUp", (event: any) => {
        if (world.isReSimulating) return;
        if (event && event.collectible && event.collectible.kind === "story_fragment") {
          if (!this.collectedFragments.includes(event.collectible.id)) {
            this.collectedFragments.push(event.collectible.id);
          }
          if (this.collectedFragments.length >= 3) {
            this.unlock(world, "story_all_fragments_c1");
          }
        }
      });
    }
  }

  private unlock(world: World<TComponents>, id: string): void {
    const achievement = this.achievements.find((a) => a.id === id);
    if (achievement && !achievement.unlocked) {
      achievement.unlocked = true;

      // Map current unlocked state and persist
      const unlockedMap: Record<string, boolean> = {};
      for (const a of this.achievements) {
        if (a.unlocked) {
          unlockedMap[a.id] = true;
        }
      }
      this.storage.setItem("unlocked_achievements", JSON.stringify(unlockedMap)).catch((e: unknown) => {
        console.error("AchievementSystem: Failed to persist unlocked achievement", e);
      });

      // Notify the world / presentation layers
      const eventBus = world.getEventBus() as EventBus;
      if (eventBus) {
        eventBus.emitDeferred("achievement:unlocked", { achievement });
      }
    }
  }

  public update(world: World<TComponents>, _deltaTime: number): void {
    if (world.getResource("IsPaused") === true) return;
    // Achievements are entirely event-driven.
  }

  public override dispose(): void {}

  public getAchievements(): Achievement[] {
    return [...this.achievements];
  }
}
