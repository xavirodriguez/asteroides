import { BaseConfigSchema } from "@tiny-aster/core";
import { z } from "zod";
import { ComboConfigSchema, ScreenDimensionsSchema } from "@tiny-aster/gameplay-kit";

export const SpaceInvadersConfigSchema = BaseConfigSchema.extend({
  ...ScreenDimensionsSchema.shape,
  KEYS: z.object({
    LEFT: z.string().default("ArrowLeft"),
    RIGHT: z.string().default("ArrowRight"),
    SHOOT: z.string().default("Space"),
    PAUSE: z.string().default("KeyP"),
    RESTART: z.string().default("KeyR")
  }).default({
    LEFT: "ArrowLeft",
    RIGHT: "ArrowRight",
    SHOOT: "Space",
    PAUSE: "KeyP",
    RESTART: "KeyR"
  }),

  PLAYER_SPEED: z.number().default(300),
  PLAYER_RENDER_WIDTH: z.number().default(40),
  PLAYER_RENDER_HEIGHT: z.number().default(20),
  PLAYER_COLLIDER_RADIUS: z.number().default(15),
  PLAYER_INITIAL_LIVES: z.number().default(3),
  PLAYER_SHOOT_COOLDOWN: z.number().default(500),

  PLAYER_BULLET_SPEED: z.number().default(500),
  PLAYER_BULLET_TTL: z.number().default(2000),
  PLAYER_BULLET_SIZE: z.number().default(4),

  ENEMY_BULLET_SPEED: z.number().default(250),
  ENEMY_BULLET_TTL: z.number().default(3000),
  ENEMY_BULLET_SIZE: z.number().default(4),
  ENEMY_FIRE_INTERVAL_MIN: z.number().default(1000),
  ENEMY_FIRE_INTERVAL_MAX: z.number().default(3000),

  INVADER_ROWS: z.number().default(5),
  INVADER_COLS: z.number().default(11),
  INVADER_MIN_ROWS: z.number().default(3),
  INVADER_MIN_COLS: z.number().default(8),
  INVADER_FULL_FORMATION_LEVEL: z.number().default(12),
  INVADER_SPACING_X: z.number().default(50),
  INVADER_SPACING_Y: z.number().default(40),
  INVADER_START_X: z.number().default(100),
  INVADER_START_Y: z.number().default(100),
  INVADER_SPEED_BASE: z.number().default(50),
  INVADER_SPEED_MAX: z.number().default(400),
  INVADER_DESCENT_STEP: z.number().default(20),
  INVADER_ANIMATION_RATE: z.number().default(0.5),

  SHIELD_COUNT: z.number().default(4),
  SHIELD_SEGMENTS_X: z.number().default(4),
  SHIELD_SEGMENTS_Y: z.number().default(3),
  SHIELD_SEGMENT_HP: z.number().default(3),
  SHIELD_START_Y: z.number().default(480),
  SHIELD_WIDTH: z.number().default(60),
  SHIELD_HEIGHT: z.number().default(40),
  SHIELD_SPACING: z.number().default(150),
  SHIELD_START_X: z.number().default(100),
  SHIELD_SEGMENT_SIZE: z.number().default(15),

  LEVEL_SPEED_MULTIPLIER: z.number().default(1.1),
  LEVEL_FIRE_RATE_MULTIPLIER: z.number().default(0.97),
  MAX_DELTA_TIME: z.number().default(100),

  PARTICLE_COUNT: z.number().default(8),
  PARTICLE_TTL_BASE: z.number().default(500),
  TRAIL_MAX_LENGTH: z.number().default(0),

  ...ComboConfigSchema.shape
});

export type SpaceInvadersConfig = z.infer<typeof SpaceInvadersConfigSchema>;

export const DEFAULT_SPACE_INVADERS_CONFIG: SpaceInvadersConfig = SpaceInvadersConfigSchema.parse({});
