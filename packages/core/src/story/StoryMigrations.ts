import { StoryPackage, StoryGraph, StoryChoice, StoryNode } from "./StoryTypes";

/**
 * Current active story schema version in engine core.
 * @public
 */
export const CURRENT_STORY_SCHEMA_VERSION = 3;

/**
 * Migration pipeline for converting legacy story data formats to the latest `StoryPackage` schema.
 *
 * @remarks
 * Safely transforms older graph asset structures, legacy choice effect property names,
 * and un-packaged single graph definitions into standard versioned `StoryPackage` structures.
 *
 * @public
 */
export class StoryMigrations {
  /**
   * Migrates a raw or legacy story data structure to the target schema version.
   *
   * @param raw - Raw story graph or package JSON object.
   * @param targetVersion - Desired schema version (defaults to CURRENT_STORY_SCHEMA_VERSION = 3).
   * @returns Fully migrated and normalized `StoryPackage`.
   */
  public static migrateStoryPackage(
    raw: unknown,
    targetVersion: number = CURRENT_STORY_SCHEMA_VERSION
  ): StoryPackage {
    if (!raw || typeof raw !== "object") {
      throw new Error("Cannot migrate null or undefined story data.");
    }

    const rawObj = raw as Record<string, unknown>;
    let pkg: StoryPackage;

    // Convert raw single StoryGraph into StoryPackage format if manifest is missing
    if (!rawObj.manifest && rawObj.nodes && rawObj.entryNodeId) {
      const storyId = (typeof rawObj.id === "string" && rawObj.id) ? rawObj.id : "migrated_story";
      const storyTitle = (typeof rawObj.title === "string" && rawObj.title) ? rawObj.title : "Migrated Story";
      pkg = {
        manifest: {
          id: storyId,
          title: storyTitle,
          contentVersion: "1.0.0",
          schemaVersion: 1,
          entryGraph: storyId
        },
        graphs: {
          [storyId]: raw as StoryGraph
        },
        characters: (rawObj.characters && typeof rawObj.characters === "object") ? (rawObj.characters as Record<string, import("./StoryTypes").StoryCharacter>) : {}
      };
    } else {
      pkg = JSON.parse(JSON.stringify(raw)) as StoryPackage;
    }

    let currentVersion = pkg.manifest.schemaVersion || 1;

    // Step 1 -> 2: Normalize choice/node effect properties and transition targets
    if (currentVersion < 2 && targetVersion >= 2) {
      for (const graph of Object.values(pkg.graphs)) {
        for (const node of Object.values(graph.nodes) as Array<StoryNode & { onEnterEffects?: import("./StoryTypes").StoryEffect[] }>) {
          if (node.onEnterEffects && !node.effects) {
            node.effects = node.onEnterEffects;
            delete node.onEnterEffects;
          }

          if (node.choices) {
            for (const choice of node.choices as Array<StoryChoice & { target?: string; onSelectEffects?: import("./StoryTypes").StoryEffect[] }>) {
              if (choice.target && !choice.targetNodeId) {
                choice.targetNodeId = choice.target;
                delete choice.target;
              }
              if (choice.onSelectEffects && !choice.effects) {
                choice.effects = choice.onSelectEffects;
                delete choice.onSelectEffects;
              }
            }
          }
        }
      }
      pkg.manifest.schemaVersion = 2;
      currentVersion = 2;
    }

    // Step 2 -> 3: Normalize nested effects structures (e.g. choice.effects.onSelect)
    if (currentVersion < 3 && targetVersion >= 3) {
      for (const graph of Object.values(pkg.graphs)) {
        for (const node of Object.values(graph.nodes) as StoryNode[]) {
          if (node.choices) {
            for (const choice of node.choices) {
              const cObj = choice as unknown as Record<string, unknown>;
              if (cObj.effects && typeof cObj.effects === "object" && !Array.isArray(cObj.effects)) {
                const effObj = cObj.effects as Record<string, unknown>;
                if (Array.isArray(effObj.onSelect)) {
                  cObj.effects = effObj.onSelect;
                }
              }
            }
          }
        }
      }
      pkg.manifest.schemaVersion = 3;
      currentVersion = 3;
    }

    return pkg;
  }
}
