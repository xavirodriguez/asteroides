import { World, CoreComponentRegistry, VelocityComponent, InvulnerableComponent, PlatformerJumperComponent } from "@tiny-aster/core";

/**
 * Interface representing a power-up effect.
 * @public
 */
export interface IPowerUpEffect {
  apply(world: World<CoreComponentRegistry>, playerEntity: number): void;
}

/**
 * Common power-up effects reusable across arcade games.
 * @public
 */
export const COMMON_POWERUP_EFFECTS: Record<string, IPowerUpEffect> = {
  speed_boost: {
    apply(w: World<CoreComponentRegistry>, player: number) {
      if (w.hasComponent(player, "Velocity")) {
        w.mutateComponent(player, "Velocity", (v: VelocityComponent) => {
          v.vx *= 1.5;
          v.vy *= 1.5;
        });
      }
    }
  },
  shield: {
    apply(w: World<CoreComponentRegistry>, player: number) {
      if (!w.hasComponent(player, "Invulnerable")) {
        w.getCommandBuffer().addComponent(player, {
          type: "Invulnerable",
          remaining: 5.0
        } as InvulnerableComponent);
      } else {
        w.mutateComponent(player, "Invulnerable", (inv: InvulnerableComponent) => {
          inv.remaining = Math.max(inv.remaining, 5.0);
        });
      }
    }
  },
  extra_life: {
    apply(w: World<CoreComponentRegistry>, player: number) {
      if (w.getSingleton("GameState" as any)) {
        w.mutateSingleton("GameState" as any, (state: any) => {
          if (typeof state.lives === "number") {
            state.lives = Math.min(5, state.lives + 1);
          }
        });
      }
    }
  },
  score_multiplier: {
    apply(w: World<CoreComponentRegistry>, player: number) {
      if (w.getSingleton("GameState" as any)) {
        w.mutateSingleton("GameState" as any, (state: any) => {
          if (typeof state.score === "number") {
            state.score += 500;
          }
        });
      }
    }
  },
  double_jump: {
    apply(world: World<CoreComponentRegistry>, player: number) {
      if (world.hasComponent(player, "PlatformerJumper")) {
        world.mutateComponent(player, "PlatformerJumper", (j: PlatformerJumperComponent) => {
          j.maxJumps = 2;
          j.jumpsRemaining = 2;
        });
      }
    }
  },
  dash_unlock: {
    apply(world: World<CoreComponentRegistry>, player: number) {
      world.getCommandBuffer().addComponent(player, {
        type: "DashUnlocked",
        unlocked: true,
        dashSpeed: 500,
        cooldown: 0,
        cooldownMax: 0.8,
        dashTimeRemaining: 0
      } as unknown as CoreComponentRegistry[keyof CoreComponentRegistry]);
    }
  },
  wall_jump_unlock: {
    apply(world: World<CoreComponentRegistry>, player: number) {
      world.getCommandBuffer().addComponent(player, {
        type: "WallJumpUnlocked",
        unlocked: true
      } as unknown as CoreComponentRegistry[keyof CoreComponentRegistry]);
    }
  }
};

/**
 * Registry class for managing power-up effects in a game instance.
 * @public
 */
export class PowerUpEffectRegistry {
  private effects = new Map<string, IPowerUpEffect>();

  constructor(includeDefaults = true) {
    if (includeDefaults) {
      for (const [type, effect] of Object.entries(COMMON_POWERUP_EFFECTS)) {
        this.register(type, effect);
      }
    }
  }

  public register(type: string, effect: IPowerUpEffect): this {
    this.effects.set(type, effect);
    return this;
  }

  public get(type: string): IPowerUpEffect | undefined {
    return this.effects.get(type);
  }

  public has(type: string): boolean {
    return this.effects.has(type);
  }

  public toRecord(): Record<string, IPowerUpEffect> {
    const record: Record<string, IPowerUpEffect> = {};
    for (const [type, effect] of this.effects.entries()) {
      record[type] = effect;
    }
    return record;
  }

  /**
   * Helper to attach this registry (both as class and legacy Record object resource) into World resources.
   */
  public attachToWorld(world: World<CoreComponentRegistry>): void {
    world.setResource("PowerUpEffectRegistry", this);
    world.setResource("PowerUpEffects", this.toRecord());
  }
}
