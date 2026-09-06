import { BaseConfigSchema } from "@tiny-aster/core";
import { z } from "zod";
import {
  ScreenDimensionsSchema,
  TileGridSchema,
  PlayerMovementSchema,
  JumpPhysicsSchema
} from "@tiny-aster/gameplay-kit";

export const PlatformerConfigSchema = BaseConfigSchema.extend({
  ...ScreenDimensionsSchema.shape,
  ...TileGridSchema.shape,
  ...PlayerMovementSchema.shape,
  ...JumpPhysicsSchema.shape
});

export type PlatformerConfig = z.infer<typeof PlatformerConfigSchema>;

export const DEFAULT_PLATFORMER_CONFIG: PlatformerConfig = PlatformerConfigSchema.parse({});
