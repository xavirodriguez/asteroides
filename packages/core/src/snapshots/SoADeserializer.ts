import { ComponentCloner } from "../ecs/ComponentCloner";
import { SoAComponentBlock } from "./WorldSnapshot";

/**
 * Utility for deserializing and hydrating Structure-of-Arrays (SoA) component buffers.
 * @public
 */
export class SoADeserializer {
  /**
   * Hydrates a single component object from an SoA component block at a specific entity index.
   *
   * @param soaData - SoA component block data.
   * @param entityIndex - Sequential entity index within the SoA block arrays.
   * @param componentType - String type tag of the component.
   * @returns Hydrated component object record.
   */
  public static hydrateComponent(
    soaData: SoAComponentBlock,
    entityIndex: number,
    componentType: string
  ): Record<string, unknown> {
    const component: Record<string, unknown> = { type: componentType };
    const keys = soaData.keys;
    const numKeys = keys.length;
    const values = soaData.values;
    const nonNumericValues = soaData.nonNumericValues;
    const booleanKeys = soaData.booleanKeys ? new Set(soaData.booleanKeys) : null;

    for (let j = 0; j < numKeys; j++) {
      const key = keys[j];
      const offset = entityIndex * numKeys + j;
      const nonNumericVal = nonNumericValues ? nonNumericValues[offset] : undefined;

      if (nonNumericVal !== undefined && nonNumericVal !== null) {
        component[key] = ComponentCloner.cloneComponent(nonNumericVal);
      } else {
        const rawVal = values ? values[offset] : undefined;
        if (booleanKeys && booleanKeys.has(key)) {
          component[key] = rawVal === 1;
        } else {
          component[key] = rawVal;
        }
      }
    }

    return component;
  }

  /**
   * Hydrates component objects across all entities in an SoA component block, invoking a callback for each hydrated entity.
   *
   * @param entities - List or map of entity IDs in the SoA block.
   * @param soaData - SoA component block data.
   * @param componentType - String type tag of the component.
   * @param onHydrated - Callback invoked for each entity with its entity ID and hydrated component instance.
   */
  public static hydrateEntities(
    entities: ArrayLike<number> | Record<string | number, unknown>,
    soaData: SoAComponentBlock,
    componentType: string,
    onHydrated: (entityId: number, component: Record<string, unknown>) => void
  ): void {
    let numEntities = 0;
    if (entities) {
      if (typeof (entities as { length?: number }).length === "number") {
        numEntities = (entities as { length: number }).length;
      } else {
        numEntities = Object.keys(entities).filter(k => !isNaN(Number(k))).length;
      }
    }

    for (let i = 0; i < numEntities; i++) {
      const entityId = Number(entities[i]);
      const component = SoADeserializer.hydrateComponent(soaData, i, componentType);
      onHydrated(entityId, component);
    }
  }
}
