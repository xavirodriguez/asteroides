/**
 * Payload for the 'spawn:wave_start' deferred event.
 * @public
 */
export interface SpawnWaveStartEvent {
  waveIndex: number;
  waveId: string;
  isBossWave: boolean;
}

/**
 * Payload for the 'spawn:wave_complete' deferred event.
 * @public
 */
export interface SpawnWaveCompleteEvent {
  waveIndex: number;
  waveId: string;
}
