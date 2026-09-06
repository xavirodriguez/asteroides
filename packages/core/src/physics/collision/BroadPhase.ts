import { TransformComponent, ColliderComponent, Collider2DComponent, CoreComponentRegistry } from "../../ecs/CoreComponents";
import { Entity } from "../../ecs/Entity";
import { World } from "../../ecs/World";
import { AABB } from "./CollisionTypes";
import { getColliderWorldBounds } from "../utils/PhysicsTransform";
import { ShapeType } from "../shapes/Shapes";

/**
 * Bounds object used for Sweep and Prune.
 * @internal
 */
interface EntityBounds {
  entity: Entity;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const boundsPool: EntityBounds[] = [];
const pairsPool: Array<[Entity, Entity]> = [];

/**
 * Broadphase collision detection module utilizing 1D Sweep and Prune.
 *
 * @remarks
 * Filters out non-overlapping entity pairs prior to expensive narrowphase SAT calculations.
 * Employs zero-allocation object pools (`boundsPool` and `pairsPool`) and in-place Shell sort
 * on the X-axis to eliminate runtime heap allocations during tick processing.
 *
 * @public
 */
export class BroadPhase {
  /**
   * Computes the world-space Axis-Aligned Bounding Box (AABB) for an entity collider.
   *
   * @remarks
   * Handles Circle, Box, and Convex Polygon geometry. Transforms local vertex offsets
   * into world coordinates using position, offset, scale, and rotation.
   *
   * @param transform - World transform component defining position, scale, and rotation.
   * @param collider - Collider component containing shape geometry and offsets.
   * @returns Computed world-space AABB bounds `{ minX, minY, maxX, maxY }`.
   */
  static getShapeBounds(transform: Readonly<TransformComponent>, collider: Readonly<ColliderComponent>): AABB {
    return getColliderWorldBounds(transform, collider);
  }

  /**
   * Executes 1D Sweep and Prune on candidate entities along the X-axis.
   *
   * @remarks
   * Performs zero runtime object or array allocations by mutating static pre-allocated pools
   * (`boundsPool` and `pairsPool`). In-place Shell sort operates on bounds sorted by `minX`,
   * providing fast O(n log n) to O(n) performance for temporally coherent physics bodies.
   *
   * @param entities - List of candidate entities to evaluate.
   * @param world - Simulation world instance containing Transform and Collider components.
   * @returns Reused array of candidate overlapping entity ID pairs `[Entity, Entity]`.
   */
  static sweepAndPrune(entities: ReadonlyArray<Entity>, world: World<CoreComponentRegistry>): Array<[Entity, Entity]> {
    // Re-use or expand boundsPool to minimize object allocation overhead.
    const count = entities.length;
    for (let i = 0; i < count; i++) {
      const entity = entities[i];
      const transform = world.getComponent(entity, "Transform") as unknown as TransformComponent;
      const collider = this.resolveColliderLike(world, entity);

      if (!boundsPool[i]) {
        boundsPool[i] = { entity: 0, minX: 0, minY: 0, maxX: 0, maxY: 0 };
      }

      const b = boundsPool[i];
      b.entity = entity;

      if (!transform || !collider) {
        b.minX = b.minY = b.maxX = b.maxY = 0;
      } else {
        const aabb = this.getShapeBounds(transform, collider);
        b.minX = aabb.minX;
        b.minY = aabb.minY;
        b.maxX = aabb.maxX;
        b.maxY = aabb.maxY;
      }
    }

    // Allocation-free in-place Shell Sort on the active region of boundsPool.
    // Extremely fast and stable for nearly-sorted coordinates typical of moving physics bodies.
    let gap = Math.floor(count / 2);
    while (gap > 0) {
      for (let i = gap; i < count; i++) {
        const temp = boundsPool[i];
        let j = i;
        while (j >= gap && boundsPool[j - gap].minX > temp.minX) {
          boundsPool[j] = boundsPool[j - gap];
          j -= gap;
        }
        boundsPool[j] = temp;
      }
      gap = Math.floor(gap / 2);
    }

    // Safe for determinism/rollback. Reusing a static pairs buffer and updating tuple elements in place eliminates per-tick pair allocations during broadphase collision checks.
    let pairIndex = 0;
    for (let i = 0; i < count; i++) {
      const a = boundsPool[i];
      if (a.entity === 0) continue; // Skip invalid

      for (let j = i + 1; j < count; j++) {
        const b = boundsPool[j];
        if (b.minX > a.maxX) break;
        if (a.minY <= b.maxY && b.minY <= a.maxY) {
          let pair = pairsPool[pairIndex];
          if (!pair) {
            pair = [a.entity, b.entity];
            pairsPool[pairIndex] = pair;
          } else {
            pair[0] = a.entity;
            pair[1] = b.entity;
          }
          pairIndex++;
        }
      }
    }
    pairsPool.length = pairIndex;
    return pairsPool;
  }

  /**
   * Resolves a Collider-like view from either `Collider` or `Collider2D`.
   * Converts Collider2D aabb/circle shapes into NarrowPhase Shape format.
   */
  private static resolveColliderLike(
    world: World<CoreComponentRegistry>,
    entity: Entity
  ): ColliderComponent | null {
    const col = world.getComponent(entity, "Collider") as ColliderComponent | undefined;
    if (col) return col;

    const c2 = world.getComponent(entity, "Collider2D") as Collider2DComponent | undefined;
    if (!c2) return null;

    let shape: ColliderComponent["shape"];
    if (c2.shape.type === "circle") {
      shape = { type: ShapeType.Circle, radius: c2.shape.radius };
    } else {
      shape = {
        type: ShapeType.Box,
        width: c2.shape.halfWidth * 2,
        height: c2.shape.halfHeight * 2
      };
    }

    return {
      type: "Collider",
      shape,
      layer: c2.layer as ColliderComponent["layer"],
      mask: c2.mask as ColliderComponent["mask"],
      enabled: c2.enabled,
      isTrigger: c2.isTrigger,
      offsetX: c2.offsetX,
      offsetY: c2.offsetY
    };
  }
}
