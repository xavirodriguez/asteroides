import { System } from "../ecs/System";
import { World } from "../ecs/World";
import { ComponentRegistry } from "../ecs/Component";
// TODO(refactor): código duplicado detectado (bloque) con systems/MutatorSystem.ts:3-23. Considerar extraer a función compartida. Ref: 6004af8c
import { ModifierComponent, ModifierEffect } from "../components/ModifierComponent";

/**
 * Legacy compatibility interface for entity mutators.
 * @public
 */
export interface Mutator<TComponents extends ComponentRegistry = ComponentRegistry, K extends keyof TComponents & string = keyof TComponents & string> {
  componentType: K;
  mutate: (component: TComponents[K], world: World<TComponents>) => void;
}

/**
 * Component-based system that processes entity modifier components and handles modifier lifetimes.
 *
 * @remarks
 * Consolidates tick-by-tick component mutations, property modifier calculations, and
 * duration expirations into a single unified system.
 *
 * @public
 */
export class ModifierSystem<TComponents extends ComponentRegistry = ComponentRegistry> extends System<TComponents> {
  private legacyMutators: Mutator<TComponents>[];

  constructor(mutators: Mutator<TComponents>[] = []) {
    super();
    this.legacyMutators = mutators;
  }

  public override update(world: World<TComponents>, deltaTime: number): void {
    if (world.getResource("IsPaused") === true) return;
    // 1. Process active ModifierComponents
    const entities = world.query("modifier" as Extract<keyof TComponents, string>);
    for (const entity of entities) {
      const modifierComp = world.getMutableComponent(entity, "modifier" as Extract<keyof TComponents, string>) as unknown as ModifierComponent | undefined;
      if (!modifierComp || !modifierComp.modifiers || modifierComp.modifiers.length === 0) continue;

      let hasExpired = false;
      for (const mod of modifierComp.modifiers) {
        if (typeof mod.duration === "number" && mod.duration > 0) {
          mod.elapsed = (mod.elapsed ?? 0) + deltaTime;
          if (mod.elapsed >= mod.duration) {
            hasExpired = true;
          }
        }
      }

      if (hasExpired) {
        modifierComp.modifiers = modifierComp.modifiers.filter(m => !(typeof m.duration === "number" && m.duration > 0 && (m.elapsed ?? 0) >= m.duration));
      }
    }

    // 2. Process legacy function mutators
    for (const mutator of this.legacyMutators) {
      if (mutator && mutator.componentType && typeof mutator.mutate === "function") {
        const compType = mutator.componentType as Extract<keyof TComponents, string>;
        const matched = world.query(compType);
        for (const entity of matched) {
          world.mutateComponent(entity, compType, (comp) => {
            mutator.mutate(comp, world);
          });
        }
      }
    }
  }

  /**
   * Helper utility to calculate the final modified numerical value for a target component property.
   *
   * @param baseValue - Initial unmodified numeric value.
   * @param modifiers - Array of active modifier effects targeting this property.
   * @returns Computed final value applying add, multiply, and override modifiers in sequence.
   */
  public static calculateModifiedValue(baseValue: number, modifiers: ModifierEffect[]): number {
    const result = baseValue;
    let addSum = 0;
    let multProduct = 1.0;
    let overrideValue: number | undefined = undefined;

    for (const mod of modifiers) {
      if (mod.type === "add") {
        addSum += mod.value;
      } else if (mod.type === "multiply") {
        multProduct *= mod.value;
      } else if (mod.type === "override") {
        overrideValue = mod.value;
      }
    }

    if (overrideValue !== undefined) {
      return overrideValue;
    }

    return (result + addSum) * multProduct;
  }

  public override onRegister(_world: World<TComponents>): void {}
  public override dispose(): void {}
}

/**
 * Legacy export alias for backwards compatibility
 * @public
 */
export const MutatorSystem = ModifierSystem;
