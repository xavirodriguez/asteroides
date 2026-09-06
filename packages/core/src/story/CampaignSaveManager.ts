import { StoryRuntime } from "./StoryRuntime";
import { MetaProgressionService, IMetaStorageProvider, MemoryStorageProvider } from "./MetaProgressionService";
import { StorySaveMigrations } from "./StorySaveMigrations";
import {
  CampaignSaveEnvelope,
  CampaignSaveEnvelopeV1,
  CURRENT_CAMPAIGN_ENVELOPE_VERSION
} from "./CampaignSaveEnvelope";

/**
 * Manager handling atomic persistence for unified campaign saves.
 *
 * @remarks
 * Encapsulates single-write storage operations under key `@campaign_save_<slotId>`
 * and orchestrates restoration of both `StoryRuntime` narrative state and `MetaProgressionService` meta state.
 *
 * @public
 */
export class CampaignSaveManager {
  private readonly storage: IMetaStorageProvider;

  constructor(storage?: IMetaStorageProvider) {
    this.storage = storage ?? new MemoryStorageProvider();
  }

  /**
   * Generates storage key for a campaign slot ID.
   */
  public getStorageKey(slotId: string): string {
    return `@campaign_save_${slotId}`;
  }

  /**
   * Atomically constructs and writes a campaign save envelope to storage.
   *
   * @param slotId - Storage slot identifier.
   * @param runtime - Active `StoryRuntime` instance.
   * @param metaService - Active `MetaProgressionService` instance.
   * @param stats - Optional campaign session statistics.
   * @returns Saved `CampaignSaveEnvelopeV1`.
   */
  public async saveCampaign(
    slotId: string,
    runtime: StoryRuntime,
    metaService: MetaProgressionService,
    stats?: {
      totalPlaytimeSeconds?: number;
      minigamesPlayed?: Record<string, number>;
      activeGameId?: string;
      activeGameSeed?: number;
    }
  ): Promise<CampaignSaveEnvelopeV1> {
    const narrativeState = runtime.getState();

    const narrativeSave = StorySaveMigrations.migrateNarrativeSave({
      saveVersion: 1,
      contentVersion: "1.0.0",
      story: narrativeState,
      evidence: runtime.getDiscoveredEvidence(),
      timestamp: new Date().toISOString(),
      checkpointId: narrativeState.currentNodeId ?? undefined
    });

    const metaState = metaService.getState();

    const envelope: CampaignSaveEnvelopeV1 = {
      schemaVersion: CURRENT_CAMPAIGN_ENVELOPE_VERSION,
      slotId,
      updatedAt: Date.now(),
      narrative: narrativeSave,
      meta: metaState,
      activeGameId: stats?.activeGameId,
      activeGameSeed: stats?.activeGameSeed,
      stats: {
        totalPlaytimeSeconds: stats?.totalPlaytimeSeconds ?? 0,
        minigamesPlayed: stats?.minigamesPlayed ?? {}
      }
    };

    const key = this.getStorageKey(slotId);
    await this.storage.setItem(key, JSON.stringify(envelope));

    return envelope;
  }

  /**
   * Loads, migrates, and restores campaign state into runtime and meta progression services.
   *
   * @param slotId - Storage slot identifier.
   * @param runtime - Target `StoryRuntime` instance.
   * @param metaService - Target `MetaProgressionService` instance.
   * @returns Restored `CampaignSaveEnvelopeV1` or `null` if slot is empty or invalid.
   */
  public async loadCampaign(
    slotId: string,
    runtime: StoryRuntime,
    metaService: MetaProgressionService
  ): Promise<CampaignSaveEnvelopeV1 | null> {
    const key = this.getStorageKey(slotId);
    const raw = await this.storage.getItem(key);

    if (!raw) {
      return null;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    // Migrate narrative save & meta state
    const narrativeSave = StorySaveMigrations.migrateNarrativeSave(parsed.narrative ?? parsed);
    const metaState = MetaProgressionService.migrateState(parsed.meta ?? {});

    // Restore StoryRuntime in-memory state
    if (narrativeSave.story) {
      runtime.setState(narrativeSave.story);
    }

    // Restore MetaProgressionService in-memory state
    metaService.loadState(metaState);

    const parsedStats = (parsed.stats && typeof parsed.stats === "object") ? (parsed.stats as Record<string, unknown>) : undefined;

    const envelope: CampaignSaveEnvelopeV1 = {
      schemaVersion: CURRENT_CAMPAIGN_ENVELOPE_VERSION,
      slotId: typeof parsed.slotId === "string" ? parsed.slotId : slotId,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
      narrative: narrativeSave,
      meta: metaState,
      activeGameId: typeof parsed.activeGameId === "string" ? parsed.activeGameId : undefined,
      activeGameSeed: typeof parsed.activeGameSeed === "number" ? parsed.activeGameSeed : undefined,
      stats: {
        totalPlaytimeSeconds: typeof parsedStats?.totalPlaytimeSeconds === "number" ? parsedStats.totalPlaytimeSeconds : 0,
        minigamesPlayed: typeof parsedStats?.minigamesPlayed === "object" && parsedStats.minigamesPlayed ? (parsedStats.minigamesPlayed as Record<string, number>) : {}
      }
    };

    return envelope;
  }
}
