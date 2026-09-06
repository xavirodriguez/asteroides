import { z } from "zod";

/**
 * Reusable Zod schema shape for screen dimension properties across minigame configs.
 * @public
 */
export const ScreenDimensionsSchema = z.object({
  SCREEN_WIDTH: z.number().default(800),
  SCREEN_HEIGHT: z.number().default(600),
  SCREEN_CENTER_X: z.number().default(400),
  SCREEN_CENTER_Y: z.number().default(300)
});

/**
 * Reusable Zod schema shape for combo scoring configuration.
 * @public
 */
export const ComboConfigSchema = z.object({
  COMBO_TIMEOUT: z.number().default(2000),
  MAX_MULTIPLIER: z.number().default(10)
});

/**
 * Reusable Zod schema shape for standard keyboard input mappings.
 * @public
 */
export const StandardControlKeysSchema = z.object({
  LEFT: z.string().default("KeyA"),
  RIGHT: z.string().default("KeyD"),
  SHOOT: z.string().default("Space"),
  PAUSE: z.string().default("KeyP"),
  RESTART: z.string().default("KeyR")
});

/**
 * Reusable Zod schema shape for player movement physics across platformer/runner games.
 * @public
 */
export const PlayerMovementSchema = z.object({
  PLAYER_SPEED: z.number().default(200),
  PLAYER_ACCEL: z.number().default(800),
  PLAYER_DECEL: z.number().default(1200),
  PLAYER_AIR_ACCEL: z.number().default(400),
  PLAYER_AIR_DECEL: z.number().default(600)
});

/**
 * Reusable Zod schema shape for jumping and gravity physics.
 * @public
 */
export const JumpPhysicsSchema = z.object({
  PLAYER_JUMP_VEL: z.number().default(350),
  PLAYER_MIN_JUMP_VEL: z.number().default(150),
  RISE_GRAVITY: z.number().default(800),
  FALL_GRAVITY: z.number().default(1200)
});

/**
 * Reusable Zod schema shape for tile grid dimensions.
 * @public
 */
export const TileGridSchema = z.object({
  TILE_SIZE: z.number().default(40)
});
