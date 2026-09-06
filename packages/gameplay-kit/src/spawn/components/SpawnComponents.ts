import { Component } from "@tiny-aster/core";

/**
 * A serializable request to spawn an entity after a specific delay.
 * @public
 */
export interface SpawnRequest {
  blueprintId: string;
  args: Record<string, any>;
  /** Delay in seconds before spawning this entity (relative to wave start). */
  delay?: number;
  /** Actual absolute time in seconds when this spawn should occur. */
  spawnTime?: number;
}

/**
 * Serializable definition of a gameplay wave or level.
 * @public
 */
export interface WaveDefinition {
  id: string;
  spawns: SpawnRequest[];
  /** Post-wave or pre-wave cooldown in seconds. */
  cooldown?: number;
  /** Is this a boss encounter? */
  isBossWave?: boolean;
}

/**
 * Component to track the state of the wave spawning/orchestration.
 * @public
 */
export interface SpawnDirectorComponent extends Component {
  type: "SpawnDirector";
  /** Current index of the wave (0-based or 1-based). */
  waveIndex: number;
  /** Remaining cooldown time in seconds. */
  cooldownRemaining: number;
  /** List of serializable spawn requests currently pending. */
  pendingSpawns: SpawnRequest[];
  /** Elapsed time in seconds since the wave started. */
  waveElapsedTime: number;
  /** Number of active/alive enemies created by this director/wave. */
  enemiesRemaining: number;
  /** The ID of the currently active wave. */
  activeWaveId?: string;
  /** Status of the current wave ("idle", "spawning", "active", "cooldown"). */
  status: "idle" | "spawning" | "active" | "cooldown";
}

/**
 * Attached to spawned entities belonging to a wave to track their presence deterministically.
 * @public
 */
export interface WaveMemberComponent extends Component {
  type: "WaveMember";
  waveIndex: number;
  waveId: string;
}
