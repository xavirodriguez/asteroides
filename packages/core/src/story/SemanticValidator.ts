import { MiniGameEncounterDSL } from "./EncounterDSLSchema";
import { StoryGraph } from "./StoryTypes";

/**
 * Validator Responsibility: Encounter DSL Semantic Validation Layer.
 *
 * Validates `MiniGameEncounterDSL` declarations against game registries and story context.
 * Distinct from `StoryGraphValidator` (graph topology) and `StoryPackageValidator` (package bundle metadata & cross-references).
 */

/**
 * Represents a semantic validation error or warning detected during encounter linting.
 *
 * @public
 */
export interface SemanticValidationError {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly message: string;
  readonly path?: string;
}

/**
 * Context specifications used by SemanticValidator for cross-referencing encounter declarations.
 *
 * @public
 */
export interface SemanticValidationContext {
  readonly knownGameIds?: ReadonlyArray<string>;
  readonly existingEncounterIds?: ReadonlyArray<string>;
  readonly storyGraph?: StoryGraph;
  readonly knownEvidenceIds?: ReadonlyArray<string>;
  readonly knownVariableKeys?: ReadonlyArray<string>;
  readonly knownFlagKeys?: ReadonlyArray<string>;
  readonly knownMetrics?: ReadonlyArray<string>;
  readonly knownSecrets?: ReadonlyArray<string>;
}

/**
 * Performs static semantic validation on MiniGameEncounter definitions.
 *
 * @remarks
 * Detects unknown gameIds, duplicate IDs, missing target story nodes/evidence/variables/flags,
 * unknown metrics/secrets, and impossible conditions.
 *
 * @public
 */
export class SemanticValidator {
  /**
   * Validates an encounter definition against context specifications.
   */
  public static validate(
    encounter: MiniGameEncounterDSL,
    context: SemanticValidationContext = {}
  ): SemanticValidationError[] {
    const errors: SemanticValidationError[] = [];

    // 1. Validate gameId
    if (context.knownGameIds && context.knownGameIds.length > 0) {
      if (!context.knownGameIds.includes(encounter.gameId)) {
        errors.push({
          severity: "error",
          code: "UNKNOWN_GAME_ID",
          message: `Unknown minigame ID '${encounter.gameId}'. Registered games: [${context.knownGameIds.join(", ")}].`,
          path: "gameId"
        });
      }
    }

    // 2. Validate duplicate encounter ID
    if (context.existingEncounterIds && context.existingEncounterIds.includes(encounter.id)) {
      errors.push({
        severity: "error",
        code: "DUPLICATE_ENCOUNTER_ID",
        message: `Encounter ID '${encounter.id}' is already registered.`,
        path: "id"
      });
    }

    // 3. Validate rule ID uniqueness
    const seenRuleIds = new Set<string>();
    if (encounter.outcomeRules) {
      encounter.outcomeRules.forEach((rule, idx) => {
        if (seenRuleIds.has(rule.id)) {
          errors.push({
            severity: "error",
            code: "DUPLICATE_RULE_ID",
            message: `Duplicate outcome rule ID '${rule.id}' detected in encounter.`,
            path: `outcomeRules[${idx}].id`
          });
        } else {
          seenRuleIds.add(rule.id);
        }

        // Validate conditions
        this.validateCondition(rule.condition, context, `outcomeRules[${idx}].condition`, errors);

        // Validate effects
        rule.effects.forEach((effect, effectIdx) => {
          this.validateEffect(
            effect,
            context,
            `outcomeRules[${idx}].effects[${effectIdx}]`,
            errors
          );
        });
      });
    }

    return errors;
  }

  private static validateCondition(
    condition: unknown,
    context: SemanticValidationContext,
    path: string,
    errors: SemanticValidationError[]
  ): void {
    if (!condition || typeof condition !== "object") return;
    const condObj = condition as Record<string, unknown>;

    if ("all" in condObj && Array.isArray(condObj.all)) {
      condObj.all.forEach((sub: unknown, idx: number) =>
        this.validateCondition(sub, context, `${path}.all[${idx}]`, errors)
      );
      return;
    }

    if ("any" in condObj && Array.isArray(condObj.any)) {
      condObj.any.forEach((sub: unknown, idx: number) =>
        this.validateCondition(sub, context, `${path}.any[${idx}]`, errors)
      );
      return;
    }

    if ("not" in condObj) {
      this.validateCondition(condObj.not, context, `${path}.not`, errors);
      return;
    }

    if ("metric" in condObj && typeof condObj.metric === "string") {
      if (context.knownMetrics && !context.knownMetrics.includes(condObj.metric)) {
        errors.push({
          severity: "warning",
          code: "UNKNOWN_METRIC",
          message: `Metric '${condObj.metric}' is not declared in known game metrics.`,
          path: `${path}.metric`
        });
      }
    }

    if ("secret" in condObj && typeof condObj.secret === "string") {
      if (context.knownSecrets && !context.knownSecrets.includes(condObj.secret)) {
        errors.push({
          severity: "warning",
          code: "UNKNOWN_SECRET",
          message: `Secret ID '${condObj.secret}' is not declared in known game secrets.`,
          path: `${path}.secret`
        });
      }
    }
  }

  private static validateEffect(
    effect: import("./StoryTypes").StoryEffect,
    context: SemanticValidationContext,
    path: string,
    errors: SemanticValidationError[]
  ): void {
    if (!effect || !effect.type) return;

    switch (effect.type) {
      case "discoverEvidence":
        if (context.knownEvidenceIds && !context.knownEvidenceIds.includes(effect.evidenceId)) {
          errors.push({
            severity: "error",
            code: "UNKNOWN_EVIDENCE_ID",
            message: `Evidence '${effect.evidenceId}' does not exist in evidence registry.`,
            path: `${path}.evidenceId`
          });
        }
        break;

      case "navigateToNode":
        if (context.storyGraph && (!context.storyGraph.nodes || !context.storyGraph.nodes[effect.nodeId])) {
          errors.push({
            severity: "error",
            code: "UNKNOWN_TARGET_NODE",
            message: `Target story node '${effect.nodeId}' does not exist in story graph '${context.storyGraph.id}'.`,
            path: `${path}.nodeId`
          });
        }
        break;

      case "setFlag":
        if (context.knownFlagKeys && !context.knownFlagKeys.includes(effect.key)) {
          errors.push({
            severity: "warning",
            code: "UNDECLARED_FLAG",
            message: `Flag '${effect.key}' is not declared in known narrative flags.`,
            path: `${path}.key`
          });
        }
        break;

      case "setVariable":
      case "incrementVariable":
        if (context.knownVariableKeys && !context.knownVariableKeys.includes(effect.key)) {
          errors.push({
            severity: "warning",
            code: "UNDECLARED_VARIABLE",
            message: `Variable '${effect.key}' is not declared in known narrative variables.`,
            path: `${path}.key`
          });
        }
        break;
    }
  }
}
