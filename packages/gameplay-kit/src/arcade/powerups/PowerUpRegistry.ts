import type { World, VelocityComponent, InvulnerableComponent, CoreComponentRegistry, Component } from "@tiny-aster/core";

/**
 * Interface representing an actionable power-up effect.
 * @public
 */
export interface IPowerUpEffect {
  apply(world: World<CoreComponentRegistry>, playerEntity: number): void;
}

/**
 * Common reusable power-up effects for arcade games.
 * @public
 */
export const COMMON_POWERUP_EFFECTS: Record<string, IPowerUpEffect> = {
  speed_boost: {
    apply(world: World<CoreComponentRegistry>, playerEntity: number): void {
      if (world.hasComponent(playerEntity, "Velocity")) {
        world.mutateComponent(playerEntity, "Velocity", (v: VelocityComponent) => {
          v.vx *= 1.5;
          v.vy *= 1.5;
        });
      }
    }
  },
  shield: {
    apply(world: World<CoreComponentRegistry>, playerEntity: number): void {
      if (!world.hasComponent(playerEntity, "Invulnerable")) {
        world.getCommandBuffer().addComponent(playerEntity, {
          type: "Invulnerable",
          remaining: 5.0
        } as InvulnerableComponent);
      } else {
        world.mutateComponent(playerEntity, "Invulnerable", (inv: InvulnerableComponent) => {
          inv.remaining = Math.max(inv.remaining, 5.0);
        });
      }
    }
  },
  extra_life: {
    apply(world: World<CoreComponentRegistry>): void {
      if (world.getSingleton("GameState" as Extract<keyof CoreComponentRegistry, string>) !== undefined) {
        world.mutateSingleton("GameState" as Extract<keyof CoreComponentRegistry, string>, (state: Component & { lives?: number; score?: number }) => {
          if (typeof state.lives === "number") {
            state.lives = Math.min(5, state.lives + 1);
          }
        });
      }
    }
  },
  score_multiplier: {
    apply(world: World<CoreComponentRegistry>): void {
      if (world.getSingleton("GameState" as Extract<keyof CoreComponentRegistry, string>) !== undefined) {
        world.mutateSingleton("GameState" as Extract<keyof CoreComponentRegistry, string>, (state: Component & { lives?: number; score?: number }) => {
          if (typeof state.score === "number") {
            state.score += 500;
          }
        });
      }
    }
  }
};

/**
 * Registry for managing power-up effect handlers.
 * @public
 */
export class PowerUpRegistry {
  private effects: Map<string, IPowerUpEffect> = new Map();

  constructor(initialEffects?: Record<string, IPowerUpEffect>) {
    this.registerCommonEffects();
    if (initialEffects) {
      for (const [type, effect] of Object.entries(initialEffects)) {
        this.register(type, effect);
      }
    }
  }

  public register(type: string, effect: IPowerUpEffect): void {
    this.effects.set(type, effect);
  }

  public get(type: string): IPowerUpEffect | undefined {
    return this.effects.get(type);
  }

  public has(type: string): boolean {
    return this.effects.has(type);
  }

  private registerCommonEffects(): void {
    for (const [type, effect] of Object.entries(COMMON_POWERUP_EFFECTS)) {
      this.effects.set(type, effect);
    }
  }
}
