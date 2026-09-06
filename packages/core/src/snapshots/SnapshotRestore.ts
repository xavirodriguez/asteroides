import { ComponentCloner } from "../ecs/ComponentCloner";
import { ComponentRegistry } from "../ecs/Component";
import { World } from "../ecs/World";
import { WorldSnapshot } from "./WorldSnapshot";
import { restoreWorldMetadata, rebuildQueries } from "./SnapshotInternalAccess";

/**
 * Classical Array of Structures (AoS) restoration utility.
 *
 * @remarks
 * Restores the complete state of an ECS World from an `AoSWorldSnapshot` instance.
 * It clears all existing entities and components, reinstates the snapshot data,
 * and completely rebuilds query indexes and structural caches to ensure consistency.
 *
 * @public
 */
export class SnapshotRestore {
  /**
   * Restores the world state from an AoS formatted snapshot.
   *
   * @remarks
   * Performs deep reconstruction of the component map structures. After restoring the
   * primitive and structural properties, it invokes `Query.rebuild` on all active world
   * queries to guarantee that system iterations continue correctly.
   *
   * @warning
   * - **Throws on SoA layout**: This class only handles classic AoS snapshots. If the snapshot
   *   is formatted as a Structure of Arrays (`state.isSoA` is true), this method will throw an exception.
   *   Use `SnapshotRestoreSoA.restore` for SoA snapshots instead.
   * - **Entity references**: Destroys any pre-existing entities not present in the snapshot. Any external
   *   systems or UI components caching entity IDs should refresh their references after restoration.
   *
   * @param world - The active ECS World instance to restore.
   * @param state - The source AoS world snapshot.
   */
  public static restore<TComponents extends ComponentRegistry>(
    world: World<TComponents>,
    state: WorldSnapshot
  ): void {
    if (state.isSoA) {
      throw new Error("SnapshotRestore does not support SoA WorldSnapshot. Use SnapshotRestoreSoA instead.");
    }

    const internal = restoreWorldMetadata(world, state);

    for (const type in state.componentData) {
      const storage = new Map<number, unknown>();
      const index = new Set<number>();
      const versions = new Map<number, number>();

      internal.componentMaps.set(type, storage);
      internal.componentIndex.set(type, index);
      internal.componentVersions.set(type, versions);

      const snapshotEntities = state.componentData[type];
      for (const entityIdStr in snapshotEntities) {
        const entityId = parseInt(entityIdStr);
        const sourceComp = snapshotEntities[entityId];
        const component = ComponentCloner.cloneComponent(sourceComp);

        storage.set(entityId, component);
        index.add(entityId);
        versions.set(entityId, internal._stateVersion);

        let componentSet = internal.entityComponentSets.get(entityId);
        if (!componentSet) {
          componentSet = new Set();
          internal.entityComponentSets.set(entityId, componentSet);
        }
        componentSet.add(type);
      }
    }

    rebuildQueries(world);
  }
}
