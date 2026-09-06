import { World } from "../../ecs/World";
import { System } from "../../ecs/System";
import { ComponentRegistry } from "../../ecs/Component";
import { Entity } from "../../ecs/Entity";
import { CollisionManifold } from "./CollisionTypes";
import { BroadPhase } from "./BroadPhase";
import { NarrowPhase } from "./NarrowPhase";
import { CoreComponentRegistry } from "../../ecs/CoreComponents";
import { ShapeType } from "../shapes/Shapes";
import { SpatialCullingSystem } from "../../systems/SpatialCullingSystem";

/**
 * Signature for a callback invoked when a physical collision occurs between two entities.
 *
 * @template TRegistry - The component registry type extending ComponentRegistry.
 * @param world - The ECS world instance containing both entities.
 * @param entityA - The first entity involved in the collision.
 * @param entityB - The second entity involved in the collision.
 * @param manifold - Detailed collision data including contact points, normals, and penetration depth.
 */
export type CollisionCallback<
  TRegistry extends ComponentRegistry = CoreComponentRegistry
> = (
  world: World<TRegistry>,
  entityA: Entity,
  entityB: Entity,
  manifold: CollisionManifold
) => void;

/**
 * Signature for a callback invoked when a trigger boundary is entered or exited.
 *
 * @template TRegistry - The component registry type extending ComponentRegistry.
 * @param world - The ECS world instance containing both entities.
 * @param entityA - The entity that owns or entered the trigger volume.
 * @param entityB - The other entity involved in the trigger interaction.
 */
export type TriggerCallback<
  TRegistry extends ComponentRegistry = CoreComponentRegistry
> = (world: World<TRegistry>, entityA: Entity, entityB: Entity) => void;

/**
 * Detects and resolves 2D collisions between entities using a broad-phase / narrow-phase pipeline.
 *
 * Supports both `Collider` and `Collider2D` components (arcade platformer uses Collider2D).
 * Populates `CollisionEvents` on entities that carry that component.
 *
 * @template TRegistry - Component registry constrained to CoreComponentRegistry.
 * @public
 */
export class CollisionSystem2D<
  TRegistry extends CoreComponentRegistry = CoreComponentRegistry
> extends System<TRegistry> {
  private onCollisionCallbacks: CollisionCallback<TRegistry>[] = [];
  private onTriggerEnterCallbacks: TriggerCallback<TRegistry>[] = [];
  private onTriggerExitCallbacks: TriggerCallback<TRegistry>[] = [];
  private activePairs = new Set<string>();
  private currentFramePairs = new Set<string>();
  private candidateEntities: Entity[] | null = null;
  private tempQuery: Entity[] = [];

  /**
 * Registers a callback invoked whenever a physical collision is detected.
   *
   * @param callback - Function receiving world, both entities, and the collision manifold.
   * @returns Unsubscribe function that removes this callback when invoked.
   */
  public onCollision(callback: CollisionCallback<TRegistry>): () => void {
    this.onCollisionCallbacks.push(callback);
    return () => {
      this.onCollisionCallbacks = this.onCollisionCallbacks.filter(cb => cb !== callback);
    };
  }

  /**
   * Registers a callback invoked when an entity first enters a trigger volume.
   *
   * @param callback - Function receiving world and both entities.
   * @returns Unsubscribe function that removes this callback when invoked.
   */
  public onTriggerEnter(callback: TriggerCallback<TRegistry>): () => void {
    this.onTriggerEnterCallbacks.push(callback);
    return () => {
      this.onTriggerEnterCallbacks = this.onTriggerEnterCallbacks.filter(cb => cb !== callback);
    };
  }

  /**
   * Registers a callback invoked when an entity exits a trigger volume.
   *
   * @param callback - Function receiving world and both entities.
   * @returns Unsubscribe function that removes this callback when invoked.
   */
  public onTriggerExit(callback: TriggerCallback<TRegistry>): () => void {
    this.onTriggerExitCallbacks.push(callback);
    return () => {
      this.onTriggerExitCallbacks = this.onTriggerExitCallbacks.filter(cb => cb !== callback);
    };
  }

  /**
   * Releases all registered callbacks and clears internal pair tracking state.
   */
  public override dispose(): void {
    this.onCollisionCallbacks = [];
    this.onTriggerEnterCallbacks = [];
    this.onTriggerExitCallbacks = [];
    this.activePairs.clear();
  }

  /**
   * Restricts collision detection to a specific set of candidate entities.
   * Pass `null` to restore full-world queries.
   *
   * @param entities - Candidate entity list, or `null` for unrestricted queries.
   */
  public setCandidates(entities: Entity[] | null): void {
    this.candidateEntities = entities;
  }

  /**
   * Executes one frame of collision detection and event population.
   *
   * @precondition Entities must possess both `Transform` and a collider component
   *               (`Collider` or `Collider2D`) to participate.
   * @invariant Active collision pair set is updated to match the current frame.
   *
   * @param world - ECS world to process.
   * @param _deltaTime - Frame delta (unused; collision is frame-based).
   * @param candidatesOverride - Optional per-call candidate list overriding setCandidates.
   */
  public update(
    world: World<TRegistry>,
    _deltaTime: number,
    candidatesOverride?: Entity[]
  ): void {
    if (world.getResource("IsPaused") === true) return;

    const w = world as unknown as World<CoreComponentRegistry>;
    const resourceCandidates = world.getResource<Entity[]>("SpatialCullingCandidates");
    const candidatesInput =
      candidatesOverride !== undefined ? candidatesOverride : this.candidateEntities;
    let candidatesList: ReadonlyArray<Entity> | null =
      candidatesInput !== null
        ? candidatesInput
        : resourceCandidates !== undefined
          ? resourceCandidates
          : null;

    if (candidatesList === null && world.getResource("SpatialCullingEnabled") === true) {
      const margin = world.getResource<number>("SpatialCullingMargin") ?? 100;
      const entities = w.query("Transform", "Collider");
      candidatesList = SpatialCullingSystem.filterInViewport(world, entities, margin);
    }

    let query: ReadonlyArray<Entity>;
    if (candidatesList !== null) {
      this.tempQuery.length = 0;
      const len = candidatesList.length;
      for (let i = 0; i < len; i++) {
        const entity = candidatesList[i];
        if (w.hasComponent(entity, "Transform") && this.hasAnyCollider(w, entity)) {
          this.tempQuery.push(entity);
        }
      }
      query = this.tempQuery;
    } else {
      // Merge Collider + Collider2D entities (arcade platformer uses Collider2D)
      const withCollider = w.query("Transform", "Collider");
      const withCollider2D = w.query("Transform", "Collider2D");
      this.tempQuery.length = 0;
      const seen = new Set<Entity>();
      for (let i = 0; i < withCollider.length; i++) {
        const e = withCollider[i];
        if (!seen.has(e)) {
          seen.add(e);
          this.tempQuery.push(e);
        }
      }
      for (let i = 0; i < withCollider2D.length; i++) {
        const e = withCollider2D[i];
        if (!seen.has(e)) {
          seen.add(e);
          this.tempQuery.push(e);
        }
      }
      query = this.tempQuery;
    }

    this.currentFramePairs.clear();

    // Clear previous-frame collision event buffers
    const eventQuery = w.query("CollisionEvents");
    const eqLen = eventQuery.length;
    for (let i = 0; i < eqLen; i++) {
      const entity = eventQuery[i];
      const component = w.getComponent(entity, "CollisionEvents");
      if (
        component &&
        (component.collisions.length > 0 ||
          component.triggersEntered.length > 0 ||
          component.triggersExited.length > 0)
      ) {
        const mutable = w.getMutableComponent(entity, "CollisionEvents");
        if (mutable) {
          mutable.collisions.length = 0;
          mutable.triggersEntered.length = 0;
          mutable.triggersExited.length = 0;
        }
      }
    }

    const broadPhasePairs = BroadPhase.sweepAndPrune(query, w);
    const bpLen = broadPhasePairs.length;
    for (let i = 0; i < bpLen; i++) {
      const [entityA, entityB] = broadPhasePairs[i];
      const colA = this.resolveCollider(w, entityA);
      const colB = this.resolveCollider(w, entityB);
      if (!colA || !colB) continue;

      if (!colA.enabled || !colB.enabled) continue;
      if (!this.shouldCollide(colA.layer, colB.mask, colB.layer, colA.mask)) continue;

      const transA = w.getComponent(entityA, "Transform")!;
      const transB = w.getComponent(entityB, "Transform")!;
      const manifold = NarrowPhase.test(
        colA.shape,
        (transA.worldX ?? transA.x) + (colA.offsetX ?? 0),
        (transA.worldY ?? transA.y) + (colA.offsetY ?? 0),
        transA.worldRotation ?? transA.rotation,
        colB.shape,
        (transB.worldX ?? transB.x) + (colB.offsetX ?? 0),
        (transB.worldY ?? transB.y) + (colB.offsetY ?? 0),
        transB.worldRotation ?? transB.rotation
      );

      if (manifold.colliding) {
        const pairId = this.getPairId(entityA, entityB);
        this.currentFramePairs.add(pairId);

        if (colA.isTrigger || colB.isTrigger) {
          if (!this.activePairs.has(pairId)) {
            this.onTriggerEnterCallbacks.forEach(cb => cb(world, entityA, entityB));
            this.notifyTriggerEvent(w, entityA, entityB, "enter");
          }
        } else {
          this.onCollisionCallbacks.forEach(cb => cb(world, entityA, entityB, manifold));
          this.notifyCollisionEvent(w, entityA, entityB, manifold);
        }
      }
    }

    // Trigger exits for pairs that were active last frame but not this frame
    for (const pairId of this.activePairs) {
      if (!this.currentFramePairs.has(pairId)) {
        const commaIdx = pairId.indexOf(",");
        const idA = Number(pairId.substring(0, commaIdx));
        const idB = Number(pairId.substring(commaIdx + 1));
        this.onTriggerExitCallbacks.forEach(cb => cb(world, idA, idB));
        this.notifyTriggerEvent(w, idA, idB, "exit");
      }
    }
    this.activePairs.clear();
    for (const pair of this.currentFramePairs) {
      this.activePairs.add(pair);
    }
  }

  /**
   * Returns true if the entity has either a `Collider` or `Collider2D` component.
   */
  private hasAnyCollider(world: World<CoreComponentRegistry>, entity: Entity): boolean {
    return world.hasComponent(entity, "Collider") || world.hasComponent(entity, "Collider2D");
  }

  /**
   * Resolves a normalized collider view from either `Collider` or `Collider2D`.
   * Collider2D shapes (`aabb` / `circle`) are converted to NarrowPhase `Shape` format.
   */
  private resolveCollider(
    world: World<CoreComponentRegistry>,
    entity: Entity
  ): {
    shape: import("../shapes/Shapes").Shape;
    layer: number;
    mask: number;
    enabled: boolean;
    isTrigger: boolean;
    offsetX?: number;
    offsetY?: number;
  } | null {
    const col = world.getComponent(entity, "Collider");
    if (col) {
      return {
        shape: col.shape,
        layer: col.layer as number,
        mask: col.mask as number,
        enabled: col.enabled,
        isTrigger: col.isTrigger,
        offsetX: col.offsetX,
        offsetY: col.offsetY
      };
    }
    const c2 = world.getComponent(entity, "Collider2D");
    if (c2) {
      let shape: import("../shapes/Shapes").Shape;
      if (c2.shape.type === "circle") {
        shape = { type: ShapeType.Circle, radius: c2.shape.radius };
      } else {
        // aabb → Box (full width/height)
        shape = {
          type: ShapeType.Box,
          width: c2.shape.halfWidth * 2,
          height: c2.shape.halfHeight * 2
        };
      }
      return {
        shape,
        layer: c2.layer,
        mask: c2.mask,
        enabled: c2.enabled,
        isTrigger: c2.isTrigger,
        offsetX: c2.offsetX,
        offsetY: c2.offsetY
      };
    }
    return null;
  }

  /**
   * Evaluates bitwise layer and mask filtering to determine whether two entities should collide.
   *
   * @param layerA - Collision layer bitmask of entity A.
   * @param maskB - Collision mask bitmask of entity B.
   * @param layerB - Collision layer bitmask of entity B.
   * @param maskA - Collision mask bitmask of entity A.
   * @returns `true` if bitwise AND operation between layer and mask is non-zero in both directions.
   */
  private shouldCollide(
    layerA: number,
    maskB: number,
    layerB: number,
    maskA: number
  ): boolean {
    return (layerA & maskB) !== 0 && (layerB & maskA) !== 0;
  }

  /**
   * Produces a stable, order-independent pair identifier for two entities.
   */
  private getPairId(a: Entity, b: Entity): string {
    return a < b ? `${a},${b}` : `${b},${a}`;
  }

  /**
   * Writes collision data into the CollisionEvents component of both entities.
   */
  private notifyCollisionEvent(
    world: World<CoreComponentRegistry>,
    a: Entity,
    b: Entity,
    manifold: CollisionManifold
  ): void {
    this.addCollisionToComponent(world, a, b, manifold, false);
    this.addCollisionToComponent(world, b, a, manifold, true);
  }

  /**
   * Appends a single collision record to an entity's CollisionEvents buffer.
   */
  private addCollisionToComponent(
    world: World<CoreComponentRegistry>,
    entity: Entity,
    other: Entity,
    manifold: CollisionManifold,
    flipNormal: boolean
  ): void {
    const eComp = world.getMutableComponent(entity, "CollisionEvents");
    if (eComp) {
      eComp.collisions.push({
        otherEntity: other,
        normalX: flipNormal ? -manifold.normalX : manifold.normalX,
        normalY: flipNormal ? -manifold.normalY : manifold.normalY,
        depth: manifold.depth,
        contactPoints: manifold.contactPoints
      });
    }
  }

  /**
   * Writes trigger enter/exit data into the CollisionEvents component of both entities.
   */
  private notifyTriggerEvent(
    world: World<CoreComponentRegistry>,
    a: Entity,
    b: Entity,
    phase: "enter" | "exit"
  ): void {
    this.addTriggerToComponent(world, a, b, phase);
    this.addTriggerToComponent(world, b, a, phase);
  }

  /**
   * Appends a single trigger enter or exit record to an entity's CollisionEvents buffer.
   */
  private addTriggerToComponent(
    world: World<CoreComponentRegistry>,
    entity: Entity,
    other: Entity,
    phase: "enter" | "exit"
  ): void {
    const eComp = world.getMutableComponent(entity, "CollisionEvents");
    if (eComp) {
      if (phase === "enter") {
        eComp.triggersEntered.push(other);
        if (!eComp.activeTriggers.includes(other)) {
          eComp.activeTriggers.push(other);
        }
      } else {
        eComp.triggersExited.push(other);
        const idx = eComp.activeTriggers.indexOf(other);
        if (idx !== -1) {
          eComp.activeTriggers.splice(idx, 1);
        }
      }
    }
  }
}

/**
 * Continuous Collision Detection system for fast-moving entities.
 *
 * Performs raycast-style swept tests between the previous and current positions
 * of entities that carry Velocity + Collider, against static colliders.
 *
 * @template TRegistry - Component registry constrained to CoreComponentRegistry.
 * @public
 */
export class CCDSystem<
  TRegistry extends CoreComponentRegistry = CoreComponentRegistry
> extends System<TRegistry> {
  private candidateEntities: Entity[] | null = null;
  private _cachedQueryArray: Entity[] = [];
  private _cachedCollidablesArray: Entity[] = [];

  /**
   * Restricts CCD queries to a specific set of candidate entities.
   * Pass `null` to restore full-world queries.
   *
   * @param entities - Candidate entity list, or `null` for unrestricted queries.
   */
  public setCandidates(entities: Entity[] | null): void {
    this.candidateEntities = entities;
  }

  /**
   * Executes one frame of continuous collision detection.
   *
   * @precondition Fast-moving entities require `Transform`, `Velocity`, and `Collider`.
   * @param world - ECS world to process.
   * @param deltaTime - Frame delta used to extrapolate swept positions.
   */
  public update(world: World<TRegistry>, deltaTime: number): void {
    const w = world as unknown as World<CoreComponentRegistry>;
    const resourceCandidates = world.getResource<Entity[]>("SpatialCullingCandidates");
    const candidatesList =
      this.candidateEntities !== null
        ? this.candidateEntities
        : resourceCandidates !== undefined
          ? resourceCandidates
          : null;

    let query: ReadonlyArray<Entity>;
    let collidables: ReadonlyArray<Entity>;

    if (candidatesList !== null) {
      this._cachedQueryArray.length = 0;
      this._cachedCollidablesArray.length = 0;
      for (let i = 0; i < candidatesList.length; i++) {
        const entity = candidatesList[i];
        const hasTransform = w.hasComponent(entity, "Transform");
        const hasCollider = w.hasComponent(entity, "Collider");
        if (hasTransform && hasCollider) {
          this._cachedCollidablesArray.push(entity);
          if (w.hasComponent(entity, "Velocity")) {
            this._cachedQueryArray.push(entity);
          }
        }
      }
      query = this._cachedQueryArray;
      collidables = this._cachedCollidablesArray;
    } else {
      query = w.query("Transform", "Velocity", "Collider");
      collidables = w.query("Transform", "Collider");
    }

    const qLen = query.length;
    for (let i = 0; i < qLen; i++) {
      const entity = query[i];
      const trans = w.getComponent(entity, "Transform")!;
      const vel = w.getComponent(entity, "Velocity")!;
      const col = w.getComponent(entity, "Collider")!;

      if (!col.enabled || (vel.vx === 0 && vel.vy === 0)) continue;

      const p0x = trans.worldX ?? trans.x;
      const p0y = trans.worldY ?? trans.y;
      const p1x = p0x + vel.vx * deltaTime;
      const p1y = p0y + vel.vy * deltaTime;

      const cLen = collidables.length;
      for (let j = 0; j < cLen; j++) {
        const other = collidables[j];
        if (entity === other) continue;

        const otherCol = w.getComponent(other, "Collider")!;
        if (!otherCol.enabled || otherCol.isTrigger) continue;
        if (!this.shouldCollide(col.layer, otherCol.mask, otherCol.layer, col.mask)) continue;

        const otherTrans = w.getComponent(other, "Transform")!;
        const ox = otherTrans.worldX ?? otherTrans.x;
        const oy = otherTrans.worldY ?? otherTrans.y;

        if (otherCol.shape.type === ShapeType.Circle) {
          const radius = otherCol.shape.radius;
          if (
            this.rayIntersectsCircle(
              p0x,
              p0y,
              p1x,
              p1y,
              ox + (otherCol.offsetX ?? 0),
              oy + (otherCol.offsetY ?? 0),
              radius
            )
          ) {
            this.notifyCollision(w, entity, other);
          }
        } else if (otherCol.shape.type === ShapeType.Box) {
          const { width, height } = otherCol.shape;
          if (
            this.rayIntersectsBox(
              p0x,
              p0y,
              p1x,
              p1y,
              ox + (otherCol.offsetX ?? 0),
              oy + (otherCol.offsetY ?? 0),
              width,
              height
            )
          ) {
            this.notifyCollision(w, entity, other);
          }
        }
      }
    }
  }

  /**
   * Evaluates bitwise layer and mask filtering.
   */
  private shouldCollide(
    layerA: number,
    maskB: number,
    layerB: number,
    maskA: number
  ): boolean {
    return (layerA & maskB) !== 0 && (layerB & maskA) !== 0;
  }

  /**
   * Tests whether a line segment intersects a circle.
   */
  private rayIntersectsCircle(
    p0x: number,
    p0y: number,
    p1x: number,
    p1y: number,
    cx: number,
    cy: number,
    radius: number
  ): boolean {
    const dx = p1x - p0x;
    const dy = p1y - p0y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return false;
    const t = ((cx - p0x) * dx + (cy - p0y) * dy) / lenSq;
    const clampedT = Math.max(0, Math.min(1, t));
    const closestX = p0x + clampedT * dx;
    const closestY = p0y + clampedT * dy;
    return (closestX - cx) ** 2 + (closestY - cy) ** 2 <= radius * radius;
  }

  /**
   * Tests whether a line segment intersects an axis-aligned box.
   */
  private rayIntersectsBox(
    p0x: number,
    p0y: number,
    p1x: number,
    p1y: number,
    bx: number,
    by: number,
    width: number,
    height: number
  ): boolean {
    const halfW = width / 2;
    const halfH = height / 2;
    const minX = bx - halfW;
    const maxX = bx + halfW;
    const minY = by - halfH;
    const maxY = by + halfH;

    let tmin = -Infinity;
    let tmax = Infinity;

    if (p1x !== p0x) {
      const tx1 = (minX - p0x) / (p1x - p0x);
      const tx2 = (maxX - p0x) / (p1x - p0x);
      tmin = Math.max(tmin, Math.min(tx1, tx2));
      tmax = Math.min(tmax, Math.max(tx1, tx2));
    } else if (p0x < minX || p0x > maxX) {
      return false;
    }

    if (p1y !== p0y) {
      const ty1 = (minY - p0y) / (p1y - p0y);
      const ty2 = (maxY - p0y) / (p1y - p0y);
      tmin = Math.max(tmin, Math.min(ty1, ty2));
      tmax = Math.min(tmax, Math.max(ty1, ty2));
    } else if (p0y < minY || p0y > maxY) {
      return false;
    }

    return tmax >= tmin && tmax >= 0 && tmin <= 1;
  }

  /**
   * Records a CCD hit into CollisionEvents on both entities.
   */
  private notifyCollision(
    world: World<CoreComponentRegistry>,
    entityA: Entity,
    entityB: Entity
  ): void {
    const compA = world.getMutableComponent(entityA, "CollisionEvents");
    if (compA) {
      compA.collisions.push({
        otherEntity: entityB,
        normalX: 0,
        normalY: 0,
        depth: 0,
        contactPoints: []
      });
    }
    const compB = world.getMutableComponent(entityB, "CollisionEvents");
    if (compB) {
      compB.collisions.push({
        otherEntity: entityA,
        normalX: 0,
        normalY: 0,
        depth: 0,
        contactPoints: []
      });
    }
  }
}
