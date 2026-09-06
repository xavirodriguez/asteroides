import { System, World, Entity, EventBus, ComponentRegistry } from "@tiny-aster/core";
import { DamageComponent, FactionComponent } from "../components/CombatComponents";

/**
 * CombatSystem processes physical collision contacts and resolves damage and faction rules.
 * Runs deterministically as part of the simulation lifecycle.
 * @public
 */
export class CombatSystem<
  TComponents extends ComponentRegistry = ComponentRegistry,
  TEvents extends Record<string, any> = Record<string, any>
> extends System<TComponents, TEvents> {
  // Safe for determinism/rollback. Reusable Set avoids per-tick heap allocations during combat resolution.
  private destroyedEntities = new Set<number>();

  constructor() {
    super();
  }

  public update(world: World<TComponents, TEvents>, _deltaTime: number): void {
    if (world.getResource("IsPaused") === true) return;
    const entitiesWithEvents = world.query("CollisionEvents" as any);
    this.destroyedEntities.clear();

    // Step 1: Iterate over collision pairs (both physical collisions and trigger entry overlaps)
    for (const entityA of entitiesWithEvents) {
      const colComp = world.getComponent(entityA, "CollisionEvents" as any) as any;
      if (!colComp) continue;

      // Process physical collisions
      if (colComp.collisions) {
        for (const collision of colComp.collisions) {
          const entityB = collision.otherEntity;

          // Double Security A: Process each pair exactly once
          // TODO(refactor): código duplicado detectado (bloque) con shared/combat/systems/CombatSystem.ts:52-62. Considerar extraer a función compartida. Ref: 35215b09
          if (entityA >= entityB) continue;

          // Double Security B: Ensure both entities still exist and aren't already queued for destruction
          if (!this.entityExists(world, entityA) || !this.entityExists(world, entityB)) continue;
          if (this.destroyedEntities.has(entityA) || this.destroyedEntities.has(entityB)) continue;

          // Resolve damage in both directions (A damages B, and B damages A)
          this.resolveDamageDirection(world, entityA, entityB, this.destroyedEntities);
          this.resolveDamageDirection(world, entityB, entityA, this.destroyedEntities);
        }
      }

      // Process trigger entry overlaps (e.g. for trigger-based projectiles or bullet/enemy overlaps)
      if (colComp.triggersEntered) {
        for (const entityB of colComp.triggersEntered) {
          // Double Security A: Process each pair exactly once
          // TODO(refactor): código duplicado detectado (bloque) con shared/combat/systems/CombatSystem.ts:37-47. Considerar extraer a función compartida. Ref: 4ceb0047
          if (entityA >= entityB) continue;

          // Double Security B: Ensure both entities still exist and aren't already queued for destruction
          if (!this.entityExists(world, entityA) || !this.entityExists(world, entityB)) continue;
          if (this.destroyedEntities.has(entityA) || this.destroyedEntities.has(entityB)) continue;

          // Resolve damage in both directions (A damages B, and B damages A)
          this.resolveDamageDirection(world, entityA, entityB, this.destroyedEntities);
          this.resolveDamageDirection(world, entityB, entityA, this.destroyedEntities);
        }
      }
    }
  }

  /**
   * Evaluates and applies damage if attacker has Damage component and target has Health component.
   */
  private resolveDamageDirection(
    world: World<TComponents, TEvents>,
    attacker: Entity,
    target: Entity,
    destroyedEntities: Set<number>
  ): void {
    if (destroyedEntities.has(attacker) || destroyedEntities.has(target)) return;

    const damageComp = world.getComponent(attacker, "Damage" as any) as any as DamageComponent | undefined;
    const healthComp = world.getComponent(target, "Health" as any) as any as any; // Cast as any to read core Health

    if (!damageComp || !healthComp) return;

    // 1. Faction Check (Friendly Fire prevention)
    const factionA = world.getComponent(attacker, "Faction" as any) as any as FactionComponent | undefined;
    const factionB = world.getComponent(target, "Faction" as any) as any as FactionComponent | undefined;

    if (factionA && factionB && factionA.faction === factionB.faction) {
      // Friendly fire: deny damage unless friendlyFire is explicitly true
      if (!damageComp.friendlyFire) {
        return;
      }
    }

    // 2. Invulnerability check
    if (healthComp.invulnerableRemaining !== undefined && healthComp.invulnerableRemaining > 0) {
      return;
    }

    // 3. Skip if target is already marked dead
    if (world.hasComponent(target, "Dead" as any)) {
      return;
    }

    // 4. Calculate and apply damage
    const prevHealth = healthComp.current;
    if (prevHealth <= 0) return; // Already dead

    const dmgAmount = damageComp.amount;
    const nextHealth = Math.max(0, prevHealth - dmgAmount);

    world.mutateComponent(target, "Health" as any, (h: any) => {
      h.current = nextHealth;
    });

    const eventBus = world.getEventBus() as EventBus;

    // Emit combat:hit deferred event
    if (eventBus) {
      eventBus.emitDeferred("combat:hit", {
        targetEntity: target,
        sourceEntity: attacker,
        amount: dmgAmount,
        remainingHealth: nextHealth,
        category: damageComp.category
      });
    }

    // Emit combat:death if target died
    if (nextHealth <= 0) {
      world.getCommandBuffer().addComponent(target, { type: "Dead" } as any);

      if (eventBus) {
        eventBus.emitDeferred("combat:death", {
          entity: target,
          sourceEntity: attacker,
          category: damageComp.category
        });
      }
    }

    // 5. Apply Damage Component Consumption Policy
    const policy = damageComp.consumption || "none";
    if (policy === "destroy-entity") {
      this.reclaimAndDestroy(world, attacker);
      destroyedEntities.add(attacker);
    } else if (policy === "remove-component") {
      world.getCommandBuffer().removeComponent(attacker, "Damage" as any);
    }
  }

  /**
   * Safe reclamation and removal of an entity.
   */
  private reclaimAndDestroy(world: World<TComponents, TEvents>, entity: Entity): void {
    world.reclaimEntity(entity);
  }

  /**
   * Helper to verify if an entity exists in the world.
   */
  private entityExists(world: World<TComponents, TEvents>, entity: Entity): boolean {
    if (typeof (world as any).hasEntity === "function") {
      return (world as any).hasEntity(entity);
    }
    return world.hasComponent(entity, "Transform" as any);
  }
}
