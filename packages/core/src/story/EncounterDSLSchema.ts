import { z } from "zod";

/**
 * Current technical schema version for Encounter DSL.
 *
 * @public
 */
export const DSL_SCHEMA_VERSION = 1;

/**
 * Zod schema validating declarative narrative side-effects triggered by encounter outcomes or choices.
 *
 * @remarks
 * Supports setting flags, modifying variables, discovering evidence, completing objectives,
 * emitting custom events, or navigating to narrative graph nodes.
 *
 * @public
 */
export const StoryEffectSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("setFlag"),
    key: z.string().min(1),
    value: z.boolean()
  }),
  z.object({
    type: z.literal("setVariable"),
    key: z.string().min(1),
    value: z.union([z.number(), z.string(), z.boolean()])
  }),
  z.object({
    type: z.literal("incrementVariable"),
    key: z.string().min(1),
    amount: z.number()
  }),
  z.object({
    type: z.literal("discoverEvidence"),
    evidenceId: z.string().min(1)
  }),
  z.object({
    type: z.literal("completeObjective"),
    objectiveId: z.string().min(1)
  }),
  z.object({
    type: z.literal("emitEvent"),
    event: z.string().min(1),
    payload: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).optional()
  }),
  z.object({
    type: z.literal("navigateToNode"),
    nodeId: z.string().min(1)
  })
]);

/**
 * Recursive Zod schema for evaluating gameplay performance metrics and secrets against declarative conditions.
 *
 * @remarks
 * Evaluates fields (such as score, duration, completion), custom game metrics, or logical boolean compositions (`all`, `any`, `not`).
 *
 * @public
 */
export const OutcomeConditionSchema: z.ZodType<import("./ArcadeIntegrationTypes").OutcomeCondition> = z.lazy(() =>
  z.union([
    z.object({
      field: z.enum(["score", "completed", "durationMs", "gameId", "runId"]),
      operator: z.enum(["==", "!=", ">", ">=", "<", "<="]),
      value: z.union([z.number(), z.string(), z.boolean()])
    }),
    z.object({
      metric: z.string().min(1),
      operator: z.enum(["==", "!=", ">", ">=", "<", "<="]),
      value: z.number()
    }),
    z.object({
      secret: z.string().min(1)
    }),
    z.object({
      all: z.array(OutcomeConditionSchema)
    }),
    z.object({
      any: z.array(OutcomeConditionSchema)
    }),
    z.object({
      not: OutcomeConditionSchema
    })
  ])
);

/**
 * Zod schema defining a prioritized outcome rule that maps gameplay conditions to narrative effects.
 *
 * @public
 */
export const MiniGameOutcomeRuleSchema = z.object({
  id: z.string().min(1),
  priority: z.number(),
  condition: OutcomeConditionSchema,
  effects: z.array(StoryEffectSchema),
  stopProcessing: z.boolean().optional()
});

/**
 * Zod schema for runtime game parameters adjusted dynamically by narrative state.
 *
 * @public
 */
export const MiniGameModifierSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  targetProperty: z.string().min(1),
  value: z.union([z.number(), z.string(), z.boolean()]),
  meta: z.record(z.string(), z.unknown()).optional()
});

/**
 * Zod schema for conditional rules applying game modifiers based on active story flags or variables.
 *
 * @public
 */
export const MiniGameModifierRuleSchema = z.object({
  id: z.string().min(1),
  conditionFlag: z.string().optional(),
  conditionVariable: z
    .object({
      key: z.string(),
      operator: z.enum(["==", "!=", ">", ">=", "<", "<="]),
      value: z.union([z.number(), z.string(), z.boolean()])
    })
    .optional(),
  modifier: MiniGameModifierSchema
});

/**
 * Zod schema for baseline minigame configuration parameters.
 *
 * @public
 */
export const MiniGameConfigSchema = z.object({
  difficulty: z.string().optional(),
  timeLimitMs: z.number().optional(),
  targetScore: z.number().optional(),
  customSettings: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).optional()
});

/**
 * Zod schema validating a complete declarative MiniGameEncounter DSL asset.
 *
 * @public
 */
export const MiniGameEncounterSchema = z.object({
  schemaVersion: z.number().default(DSL_SCHEMA_VERSION),
  contentVersion: z.string().default("1.0.0"),
  id: z.string().min(1),
  gameId: z.string().min(1),
  baseConfig: MiniGameConfigSchema.optional(),
  modifierRules: z.array(MiniGameModifierRuleSchema).optional(),
  outcomeRules: z.array(MiniGameOutcomeRuleSchema),
  replayable: z.boolean().optional(),
  meta: z.record(z.string(), z.unknown()).optional()
});

/**
 * Inferred TypeScript type for complete declarative MiniGameEncounter DSL.
 *
 * @public
 */
export type MiniGameEncounterDSL = z.infer<typeof MiniGameEncounterSchema>;
