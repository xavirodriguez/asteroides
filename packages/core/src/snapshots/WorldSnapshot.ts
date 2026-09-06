/**
 * Base properties shared by both Array of Structures (AoS) and Structure of Arrays (SoA) snapshots.
 *
 * @remarks
 * Captures simulation metadata, active entity tracks, pre-allocated pool states, and RNG keys.
 * @public
 */
export interface BaseWorldSnapshot {
  /**
   * Sorted array of all active entity packed identifiers.
   */
  entities: number[];
  /**
   * The next available incremental entity slot index.
   */
  nextEntityId: number;
  /**
   * List of recycled/freed entity slot indices awaiting reuse.
   */
  freeEntities: number[];
  /**
   * Active generation numbers indexed by entity slot index, ensuring rollback slot-generation validation.
   */
  generations?: number[];
  /**
   * Monotonically incremented version track representing any structural change.
   */
  structureVersion: number;
  /**
   * Monotonically incremented version track representing any state mutation.
   */
  stateVersion: number;
  /**
   * Initial seed configured for the deterministic gameplay RNG service.
   */
  seed: number;
  /**
   * Current serializable state integer/index of the gameplay LCG random generator.
   */
  rngState?: number;
  /**
   * The current simulation frame/tick count.
   */
  tick: number;
}

/**
 * Snapshot representation organizing component data classically by entity (Array of Structures).
 *
 * @remarks
 * Captures component data in a format organized by component type and entity ID, i.e.,
 * `Record<ComponentType, Record<EntityID, SerializedComponentData>>`.
 *
 * Best suited for debuggability, introspection, and incremental delta sync packets.
 * @public
 */
export interface AoSWorldSnapshot extends BaseWorldSnapshot {
  /**
   * Discriminator field ensuring layout identification during restoration.
   */
  isSoA?: false;
  /**
   * Map-of-maps storing serialized component data.
   */
  componentData: ComponentDataSnapshot;
  soaComponentData?: never;
}

/**
 * Snapshot representation organizing component data continuously by property (Structure of Arrays).
 *
 * @remarks
 * Groups components of the same type together into continuous TypedArrays (`Float64Array`, `Int32Array`)
 * to prevent object allocation overhead and significantly reduce garbage collection (GC) pressure.
 * @public
 */
export interface SoAWorldSnapshot extends BaseWorldSnapshot {
  /**
   * Discriminator field ensuring layout identification during restoration.
   */
  isSoA: true;
  /**
   * Continuous TypedArray block mapping for each serialized component type.
   */
  soaComponentData: Record<string, SoAComponentTypeData>;
  componentData?: never;
}

/**
 * Partial update descriptor representing changes to a world snapshot.
 * @public
 */
export type SnapshotDelta = Partial<BaseWorldSnapshot> & {
  isSoA?: boolean;
  componentData?: ComponentDataSnapshot;
  soaComponentData?: Record<string, Partial<SoAComponentTypeData>>;
};

/**
 * Represents a serializable snapshot of the world state.
 *
 * ### Architectural Concept: The Memento Pattern
 * In game engineering, a snapshot is a concrete implementation of the **Memento Pattern**.
 * It externalizes the internal state of a simulation without violating encapsulation, allowing the
 * game engine to capture a "save point" of the simulation's progress and restore it exactly at a
 * later time.
 *
 * ### Why Determinism Matters
 * Snapshots are exponentially more powerful in a **deterministic simulation**. If the simulation is
 * deterministic (i.e., given the same initial state and input sequence, it produces the exact same
 * output), the engine does not need to store every frame's entire graphical or state representations.
 * Instead, it only needs:
 * 1. An occasional full snapshot (the memento state).
 * 2. A sequence of user inputs.
 * By combining a past snapshot and a sequence of inputs, the engine can fast-forward or replay the
 * simulation to any target frame.
 *
 * ### Snapshot Layouts: AoS vs. SoA
 * TinyAster supports two snapshot layout formats, each introducing specific architectural trade-offs:
 *
 * | Attribute | AoS (Array of Structures) | SoA (Structure of Arrays) |
 * | :--- | :--- | :--- |
 * | **Organization** | Organized by entity first: `Record<ComponentType, Record<EntityID, ComponentData>>` | Organized by property continuously: flat Float64/Int32 TypedArrays |
 * | **Use Case** | Readability, debuggability, inspections, and partial delta synchronization. | High-performance, low Garbage Collection (GC) pressure, network efficiency. |
 * | **GC Pressure** | **High**: Allocates thousands of individual small objects, forcing significant GC overhead. | **Extremely Low**: Reuses or maps continuous buffers, reducing allocation overhead. |
 * | **Reconstruction**| Simple deserialization, but slower due to frequent object allocation. | Highly optimized, direct restoration into flat index structures. |
 *
 * ---
 *
 * ### Conceptual Timeline: Rollback & Reconciliation
 * Developers frequently confuse the following five networking and state concepts. Here is their definition
 * and how they participate in a rollback loop:
 *
 * 1. **Snapshotting**: Capturing the current simulation state into a `WorldSnapshot` object.
 * 2. **Prediction**: The client immediately simulates local actions upon receiving player input (e.g., tick 100 to 105), rather than waiting for server round-trip latency, ensuring zero-latency responsiveness.
 * 3. **Server Reconciliation**: The process of validating predicted states against the server's authoritative state.
 * 4. **Rollback**: Discarding incorrect predicted states, reverting the simulation back to a known-valid state.
 * 5. **Replay**: Re-running inputs from the rollback tick forward to the current local tick.
 *
 * #### Replay and Rollback Flow Diagram:
 * ```text
 *  Time (Ticks) ────────────────────────────────────────────────────────►
 *
 *  [Client predicted]    Tick 100 ──► Tick 101 ──► Tick 102 ──► Tick 103
 *                                                             (Current local)
 *                                                                    │
 *  [Authoritative state received]                              Mismatch!
 *  (Server verified tick 101)                                        │
 *                                                                    ▼
 *  [Rollback]            Tick 101 (Reverted to Authoritative Snapshot)
 *                                │
 *  [Replay Buffer Inputs]        └──────► Tick 102 ──────► Tick 103 (Corrected state)
 * ```
 *
 * @warning
 * **Serializable state only**: Snapshots only capture serializable state (primitive
 * values, plain objects/arrays). The following are NOT captured and will be lost or
 * corrupted during snapshot/restore:
 * - Functions and closures.
 * - Class instances (unless they are plain objects under the hood).
 * - Circular references.
 * - External/native resources (e.g. GPU buffers, DOM elements, AudioContext handles).
 * - Map and Set instances (must be converted to Objects/Arrays if needed).
 *
 * These must be managed, re-initialized, or manually synchronized after restoration.
 * @public
 */
export type WorldSnapshot = AoSWorldSnapshot | SoAWorldSnapshot;

/**
 * Flat storage of component data organized by type and entity ID (classic AoS representation).
 * @public
 */
export type ComponentDataSnapshot = Record<string, Record<number, SerializedComponent>>;

/**
 * A serialized representation of a component, containing only its serializable properties.
 * @public
 */
export type SerializedComponent = Record<string, unknown>;

/**
 * Core interface representing a single continuous block of SoA component fields.
 * @public
 */
export interface SoAComponentBlock {
  /**
   * Property names of the serialized keys for this component type in a stable, alphabetical order.
   */
  keys: string[];
  /**
   * Flat array of entity IDs that possess this component type.
   */
  entities: Int32Array | number[];
  /**
   * Continuous flat array storing numeric and boolean values in a structured stride.
   */
  values: Float64Array | number[];
  /**
   * Flat array storing non-numeric properties (e.g. nested objects, arrays, strings) or undefined.
   */
  nonNumericValues?: unknown[];
  /**
   * Keys that are boolean values and should be converted back to true/false.
   */
  booleanKeys?: string[];
}

/**
 * Structure of Arrays (SoA) layout for component storage inside snapshots.
 *
 * @remarks
 * Groups components of the same type together into TypedArrays to prevent object allocation
 * overhead and reduce GC pressure.
 * @public
 */
export interface SoAComponentTypeData extends SoAComponentBlock {
  /**
   * Names of the serialized keys for this component type in a stable order.
   */
  keys: string[];

  /**
   * Flat array of entity IDs that possess this component type.
   */
  entities: Int32Array;

  /**
   * Flat Float64Array storing numeric and boolean properties.
   *
   * @remarks
   * Stored at index `entityIndex * keys.length + keyIndex`.
   * Boolean values are stored as 1 (true) or 0 (false).
   */
  values: Float64Array;

  /**
   * Flat array storing non-numeric properties (e.g. nested objects, arrays, strings).
   *
   * @remarks
   * Stored at index `entityIndex * keys.length + keyIndex` corresponding to values.
   */
  nonNumericValues?: unknown[];

  /**
   * Keys that are boolean values and should be converted back to true/false.
   */
  booleanKeys?: string[];
}

/**
 * Utility to filter an SoA formatted WorldSnapshot by a Set of interest entity IDs.
 *
 * @remarks
 * This allows the server to partition a large, global SoA snapshot into smaller, client-specific
 * interest boundaries (Area of Interest / Spatial partitioning), reducing network bandwidth by transmitting
 * only entity states relevant to each client.
 *
 * @param snapshot - The global SoA world snapshot.
 * @param interestIds - The set of entity IDs that are relevant to the target client.
 * @returns A filtered SoA world snapshot containing only the requested entities.
 * @public
 */
export function filterSoASnapshot(snapshot: WorldSnapshot, interestIds: Set<number>): WorldSnapshot {
  if (!snapshot.isSoA || !(snapshot as import("./WorldSnapshot").SoAWorldSnapshot).soaComponentData) {
    return snapshot;
  }

  const filteredEntities = snapshot.entities.filter(id => interestIds.has(id));
  const filteredSoaComponentData: Record<string, SoAComponentTypeData> = {};

  const soaComponentData = snapshot.soaComponentData;
  for (const type in soaComponentData) {
    const data: SoAComponentTypeData = soaComponentData[type];
    const keys: string[] = data.keys;
    const numKeys: number = keys.length;
    const entities = data.entities;

    let numEntities = 0;
    if (entities) {
      if (typeof (entities as unknown as { length?: number }).length === "number") {
        numEntities = (entities as unknown as { length: number }).length;
      } else {
        numEntities = Object.keys(entities).filter(k => !isNaN(Number(k))).length;
      }
    }

    // Find indices of matching entities
    const matchingIndices: number[] = [];
    for (let i = 0; i < numEntities; i++) {
      const entityId = entities[i];
      if (interestIds.has(entityId)) {
        matchingIndices.push(i);
      }
    }

    if (matchingIndices.length === 0) continue;

    const newEntities = new Int32Array(matchingIndices.length);
    const newValues = new Float64Array(matchingIndices.length * numKeys);
    const newNonNumericValues = data.nonNumericValues ? new Array(matchingIndices.length * numKeys) : undefined;

    for (let i = 0; i < matchingIndices.length; i++) {
      const oldIndex = matchingIndices[i];
      newEntities[i] = entities[oldIndex];

      for (let j = 0; j < numKeys; j++) {
        const oldOffset = oldIndex * numKeys + j;
        const newOffset = i * numKeys + j;
        newValues[newOffset] = data.values[oldOffset];
        if (newNonNumericValues && data.nonNumericValues) {
          newNonNumericValues[newOffset] = data.nonNumericValues[oldOffset];
        }
      }
    }

    filteredSoaComponentData[type] = {
      keys,
      entities: newEntities,
      values: newValues,
      nonNumericValues: newNonNumericValues,
      booleanKeys: data.booleanKeys
    };
  }

  return {
    ...snapshot,
    entities: filteredEntities,
    soaComponentData: filteredSoaComponentData
  };
}
