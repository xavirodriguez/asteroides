import { NarrativeSaveGame, StoryState, StoryObjective } from "./StoryTypes";

/**
 * Migration pipeline for converting legacy narrative player save game state into standard `NarrativeSaveGame` structures.
 *
 * @remarks
 * **Semantic Distinction:**
 * - `StoryMigrations`: Handles narrative package/content schema migrations (`StoryPackage` and `StoryGraph` definition versions).
 * - `StorySaveMigrations`: Handles player save file migrations (`NarrativeSaveGame` and runtime `StoryState` progress snapshots).
 *
 * Safely normalizes raw JSON payloads, legacy unnested `StoryState` objects, missing fields,
 * and partial state maps without altering user progress or game variable semantics.
 *
 * @public
 */
export class StorySaveMigrations {
  /**
   * Migrates and normalizes a raw or legacy narrative save payload into a `NarrativeSaveGame`.
   *
   * @param raw - Raw JSON payload, legacy `StoryState`, or partial `NarrativeSaveGame`.
   * @returns Fully normalized `NarrativeSaveGame` instance.
   */
  public static migrateNarrativeSave(raw: unknown): NarrativeSaveGame {
    const nowIso = new Date().toISOString();

    if (!raw || typeof raw !== "object") {
      return {
        saveVersion: 1,
        contentVersion: "1.0.0",
        story: {
          graphId: null,
          currentNodeId: null,
          flags: {},
          variables: {},
          selectedChoices: [],
          objectives: {},
          evidence: [],
          history: []
        },
        evidence: [],
        relationships: {},
        memories: [],
        timestamp: nowIso
      };
    }

    const obj = raw as Record<string, unknown>;

    let storyState: StoryState;

    // Check if raw object is a legacy unnested StoryState (or has obj.story)
    if (obj.story && typeof obj.story === "object") {
      storyState = this.normalizeStoryState(obj.story);
    } else {
      storyState = this.normalizeStoryState(obj);
    }

    const evidenceArray = Array.isArray(obj.evidence)
      ? obj.evidence.filter((e): e is string => typeof e === "string")
      : storyState.evidence ?? [];

    const relationships =
      obj.relationships && typeof obj.relationships === "object"
        ? (obj.relationships as Record<string, import("./StoryTypes").RelationshipState>)
        : {};

    const memories = Array.isArray(obj.memories) ? (obj.memories as import("./StoryTypes").CharacterMemory[]) : [];

    const saveVersion = typeof obj.saveVersion === "number" ? obj.saveVersion : 1;
    const contentVersion = typeof obj.contentVersion === "string" ? obj.contentVersion : "1.0.0";
    const timestamp = typeof obj.timestamp === "string" ? obj.timestamp : nowIso;
    const checkpointId = typeof obj.checkpointId === "string" ? obj.checkpointId : undefined;

    return {
      saveVersion,
      contentVersion,
      story: storyState,
      evidence: evidenceArray,
      relationships,
      memories,
      timestamp,
      ...(checkpointId ? { checkpointId } : {})
    };
  }

  private static normalizeStoryState(rawStory: unknown): StoryState {
    if (!rawStory || typeof rawStory !== "object") {
      return {
        graphId: null,
        currentNodeId: null,
        flags: {},
        variables: {},
        selectedChoices: [],
        objectives: {},
        evidence: [],
        history: []
      };
    }

    const sObj = rawStory as Record<string, unknown>;

    const graphId = typeof sObj.graphId === "string" ? sObj.graphId : null;
    const currentNodeId = typeof sObj.currentNodeId === "string" ? sObj.currentNodeId : null;

    const flags: Record<string, boolean> = {};
    if (sObj.flags && typeof sObj.flags === "object") {
      for (const [k, v] of Object.entries(sObj.flags as Record<string, unknown>)) {
        flags[k] = Boolean(v);
      }
    }

    const variables: Record<string, number | string | boolean> = {};
    if (sObj.variables && typeof sObj.variables === "object") {
      for (const [k, v] of Object.entries(sObj.variables as Record<string, unknown>)) {
        if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") {
          variables[k] = v;
        }
      }
    }

    const selectedChoices = Array.isArray(sObj.selectedChoices)
      ? sObj.selectedChoices.filter((c): c is string => typeof c === "string")
      : [];

    const objectives: Record<string, StoryObjective> = {};
    if (sObj.objectives && typeof sObj.objectives === "object") {
      for (const [k, v] of Object.entries(sObj.objectives as Record<string, unknown>)) {
        if (v && typeof v === "object") {
          const item = v as Record<string, unknown>;
          objectives[k] = {
            id: typeof item.id === "string" ? item.id : k,
            titleKey: typeof item.titleKey === "string" ? item.titleKey : k,
            descriptionKey: typeof item.descriptionKey === "string" ? item.descriptionKey : undefined,
            targetCount: typeof item.targetCount === "number" ? item.targetCount : 1,
            currentCount: typeof item.currentCount === "number" ? item.currentCount : 0,
            completed: Boolean(item.completed)
          };
        }
      }
    }

    const evidence = Array.isArray(sObj.evidence)
      ? sObj.evidence.filter((e): e is string => typeof e === "string")
      : [];

    const history = Array.isArray(sObj.history)
      ? sObj.history.filter((h): h is string => typeof h === "string")
      : [];

    return {
      graphId,
      currentNodeId,
      flags,
      variables,
      selectedChoices,
      objectives,
      evidence,
      history
    };
  }
}
