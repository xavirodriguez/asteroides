import { BaseConfigSchema } from "@tiny-aster/core";
import { z } from "zod";
import {
  ScreenDimensionsSchema,
  TileGridSchema,
  PlayerMovementSchema,
  JumpPhysicsSchema
} from "@tiny-aster/gameplay-kit";

export const EchoRunnerConfigSchema = BaseConfigSchema.extend({
  ...ScreenDimensionsSchema.shape,
  ...TileGridSchema.shape,
  ...PlayerMovementSchema.shape,
  ...JumpPhysicsSchema.shape,
  PLAYER_SPEED: z.number().default(220),
  PLAYER_ACCEL: z.number().default(900),
  PLAYER_DECEL: z.number().default(1300),
  PLAYER_AIR_ACCEL: z.number().default(450),
  PLAYER_AIR_DECEL: z.number().default(700),
  PLAYER_JUMP_VEL: z.number().default(370),
  PLAYER_MIN_JUMP_VEL: z.number().default(160),
  RISE_GRAVITY: z.number().default(850),
  FALL_GRAVITY: z.number().default(1300),
  APEX_THRESHOLD: z.number().default(50),
  APEX_GRAVITY_MULTIPLIER: z.number().default(0.2),
  COYOTE_TIME_MAX: z.number().default(0.15),
  JUMP_BUFFER_MAX: z.number().default(0.1)
});

export type EchoRunnerConfig = z.infer<typeof EchoRunnerConfigSchema>;

export const DEFAULT_ECHO_RUNNER_CONFIG: EchoRunnerConfig = EchoRunnerConfigSchema.parse({});
