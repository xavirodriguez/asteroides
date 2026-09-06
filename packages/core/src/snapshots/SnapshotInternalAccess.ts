import { World } from "../ecs/World";
import { WorldSnapshot } from "./WorldSnapshot";
import { ComponentRegistry } from "../ecs/Component";
import { Query } from "../ecs/Query";

/**
 * Internal access interface exposing World metadata and index properties for snapshot restoration.
 * @internal
 */
export interface InternalWorldAccess<TComponents extends ComponentRegistry = ComponentRegistry> {
  activeEntities: Set<number>;
  nextEntityId: number;
  freeEntities: number[];
  generations: number[];
  _structureVersion: number;
  _stateVersion: number;
  _tick: number;
  entityComponentSets: Map<number, Set<string>>;
  componentMaps: Map<string, Map<number, unknown>>;
  componentIndex: Map<string, Set<number>>;
  componentVersions: Map<string, Map<number, number>>;
  queries: Query<TComponents>[];
}

/**
 * Restores metadata, entity bookkeeping, and RNG state on the target world from a snapshot.
 * @internal
 */
export function restoreWorldMetadata<TComponents extends ComponentRegistry>(
  world: World<TComponents>,
  state: WorldSnapshot
): InternalWorldAccess<TComponents> {
  const internal = world as unknown as InternalWorldAccess<TComponents>;

  internal.activeEntities = new Set(state.entities);
  internal.nextEntityId = state.nextEntityId;
  internal.freeEntities = [...state.freeEntities];
  internal.generations = state.generations ? Array.from(state.generations) : [];
  internal._structureVersion = state.structureVersion;
  internal._stateVersion = state.stateVersion;
  internal._tick = state.tick;

  if (state.rngState !== undefined) {
    world.gameplayRandom.setSeed(state.rngState);
  } else if (state.seed !== undefined) {
    world.gameplayRandom.setSeed(state.seed);
  }

  internal.entityComponentSets.clear();
  internal.componentMaps.clear();
  internal.componentIndex.clear();
  internal.componentVersions.clear();

  return internal;
}

/**
 * Rebuilds all active query indexes using the restored active entities and component sets.
 * @internal
 */
export function rebuildQueries<TComponents extends ComponentRegistry>(
  world: World<TComponents>
): void {
  const internal = world as unknown as InternalWorldAccess<TComponents>;
  internal.queries.forEach(query => {
    query.rebuild(internal.activeEntities, internal.entityComponentSets);
  });
}
