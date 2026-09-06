import { SpaceInvadersConfig } from "../types/SpaceInvadersConfigSchema";

/**
 * Calculates the invader formation grid dimensions (rows and columns) for a given level.
 *
 * @param level - The current level number (1-based).
 * @param config - The Space Invaders configuration object.
 * @returns An object containing the row and column counts for the formation.
 * @public
 */
export function getFormationSize(
  level: number,
  config: SpaceInvadersConfig
): { rows: number; cols: number } {
  if (level <= 1) {
    return { rows: config.INVADER_MIN_ROWS, cols: config.INVADER_MIN_COLS };
  }

  const fullLevel = config.INVADER_FULL_FORMATION_LEVEL;
  if (level >= fullLevel) {
    return { rows: config.INVADER_ROWS, cols: config.INVADER_COLS };
  }

  const denominator = fullLevel - 1;
  const t = denominator > 0 ? Math.min(1, (level - 1) / denominator) : 1;

  const rows = Math.round(config.INVADER_MIN_ROWS + t * (config.INVADER_ROWS - config.INVADER_MIN_ROWS));
  const cols = Math.round(config.INVADER_MIN_COLS + t * (config.INVADER_COLS - config.INVADER_MIN_COLS));

  return { rows, cols };
}
