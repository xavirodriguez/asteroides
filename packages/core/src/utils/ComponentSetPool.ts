import { World } from "../ecs/World";
import { Component } from "../ecs/Component";
import { Entity, ReclaimableComponent, ReleaseContext, ComponentSetReleaseContext } from "../ecs/CoreComponents";
import { ObjectPool } from "./ObjectPool";
import { createDeferredEntity } from "../ecs/EntityHelpers";

/**
 * Generic ComponentSetPool that manages a pool of component sets.
 *
 * @remarks
 * Aims to reduce garbage collector pressure by reusing component objects across
 * entities in high-churn scenarios.
 *
 * Type parameter T: T - A record of component types that form the pooled entity.
 * @public
 */
export class ComponentSetPool<T extends Record<string, Component>> {
  private pool: ObjectPool<T>;
  private keyToType: Record<string, string>;
  private readonly activeEntities = new Set<Entity>();

  /**
   * @param factory - Creates a new set of component objects.
   * @param reset - Resets component data before an entity is returned to the pool.
   * @param initialSize - Number of entities to pre-allocate.
   */
  constructor(
    factory: () => T,
    reset: (data: T) => void,
    initialSize: number = 0
  ) {
    this.pool = new ObjectPool<T>(factory, reset, initialSize);

    // Capture the mapping from keys in T to ECS component types
    const template = factory();
    this.keyToType = {};
    for (const key in template) {
      this.keyToType[key] = template[key].type;
    }
    // Optimization: Feed the template used for mapping back into the pool
    this.pool.release(template);
  }

  /**
   * Acquires an entity and attaches the pooled components.
   * Returns both the entity ID and the component set for custom initialization.
   *
   * @param world - The ECS world.
   * @returns An object containing the new entity ID and the component set.
   */
  public acquire(world: World): { entity: Entity; components: T } {
    const components = this.pool.acquire();

    // Clean up _released flag upon reuse/acquisition
    for (const key in components) {
      const comp = components[key];
      if (comp.type === "Reclaimable") {
        delete (comp as unknown as ReclaimableComponent & { _released?: boolean })._released;
      }
    }

    const { entity, add } = createDeferredEntity(world);
    this.activeEntities.add(entity);

    for (const key in components) {
      const comp = components[key];
      // Automatically wire up Reclaimable components to return to this pool
      if (comp.type === "Reclaimable") {
        (comp as unknown as ReclaimableComponent).onReclaim = (context: ReleaseContext) => this.release(context);
      }
      add(comp as T[keyof T] & { type: keyof T & string });
    }

    return { entity, components };
  }

  private handleInvalidRelease(entity: Entity): void {
    const message = `Double release or foreign entity detected: entity=${entity}, pool=ComponentSetPool`;

    if (process.env.NODE_ENV !== "production") {
      throw new Error(message);
    }

    console.warn(message);
  }

  /**
   * Releases an entity's components back to the pool.
   * NOTE: This does NOT remove the entity from the world. The caller is responsible
   * for calling world.removeEntity(entity) after notifying the pool.
   *
   * @param context - The release context containing world, entity and optional container.
   */
  public release(context: ComponentSetReleaseContext<T>): void {
    const { world, entity, container } = context;

    if (!this.activeEntities.has(entity)) {
      const reclaimable = world && typeof world.getComponent === "function"
        ? (world.getComponent(entity, "Reclaimable" as Extract<keyof import("../ecs/CoreComponents").CoreComponentRegistry, string>) as unknown as ReclaimableComponent & { _released?: boolean } | undefined)
        : undefined;

      if (reclaimable && !reclaimable._released && typeof world.isAlive === "function" && world.isAlive(entity)) {
        // Entity was restored from snapshot during resimulation/rollback
        this.activeEntities.add(entity);
      } else {
        this.handleInvalidRelease(entity);
        return;
      }
    }

    this.activeEntities.delete(entity);

    const components = container || ({} as T);
    let allFound = true;

    for (const key in this.keyToType) {
      const type = this.keyToType[key];
      // Use getMutableComponent to avoid mutation proxy when releasing/resetting components
      const comp = world.getMutableComponent(entity, type);
      if (comp) {
        components[key as keyof T] = comp as T[keyof T];
      } else {
        allFound = false;
        break;
      }
    }

    if (allFound) {
      const reclaimableComp = world.getMutableComponent(entity, "Reclaimable") as unknown as ReclaimableComponent & { _released?: boolean } | undefined;
      if (reclaimableComp) {
        reclaimableComp._released = true;
      }
      this.pool.release(components);
    }
  }

  /**
   * Returns the number of available entity component sets in the pool.
   */
  public get size(): number {
    return this.pool.size;
  }
}
