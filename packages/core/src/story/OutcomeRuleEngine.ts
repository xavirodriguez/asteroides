import {
  MiniGameOutcomeRule,
  MiniGameResult,
  OutcomeCondition
} from "./ArcadeIntegrationTypes";
import { StoryEffect } from "./StoryTypes";

/**
 * Pure rule engine for evaluating declarative minigame outcome rules into narrative effects.
 *
 * @remarks
 * Performs pure functional evaluation without mutating `StoryRuntime` or external state.
 * Evaluates rules sorted by priority descending and respects `stopProcessing` directives.
 *
 * @public
 */
export class OutcomeRuleEngine {
  /**
   * Evaluates minigame results against declarative outcome rules.
   *
   * @param result - Completed or terminated minigame result data.
   * @param rules - Array of candidate `MiniGameOutcomeRule` definitions.
   * @returns Pure list of resulting `StoryEffect` commands to execute.
   */
  public evaluate(
    result: MiniGameResult,
    rules: ReadonlyArray<MiniGameOutcomeRule>
  ): StoryEffect[] {
    if (!rules || rules.length === 0) return [];

    // Sort rules by priority descending
    const sortedRules = [...rules].sort((a, b) => b.priority - a.priority);

    const accumulatedEffects: StoryEffect[] = [];

    for (const rule of sortedRules) {
      if (this.evaluateCondition(result, rule.condition)) {
        accumulatedEffects.push(...rule.effects);
        if (rule.stopProcessing) {
          break;
        }
      }
    }

    return accumulatedEffects;
  }

  /**
   * Evaluates a single declarative `OutcomeCondition` predicate against a minigame result.
   *
   * @param result - Minigame run result.
   * @param condition - OutcomeCondition predicate tree.
   * @returns Boolean truth result.
   */
  public evaluateCondition(
    result: MiniGameResult,
    condition: OutcomeCondition
  ): boolean {
    if ("all" in condition) {
      return condition.all.every((cond) => this.evaluateCondition(result, cond));
    }
    if ("any" in condition) {
      return condition.any.some((cond) => this.evaluateCondition(result, cond));
    }
    if ("not" in condition) {
      return !this.evaluateCondition(result, condition.not);
    }

    if ("field" in condition) {
      const fieldValue = result[condition.field];
      return this.compare(fieldValue, condition.value, condition.operator);
    }

    if ("metric" in condition) {
      const metricValue = result.metrics ? result.metrics[condition.metric] : undefined;
      if (metricValue === undefined) return false;
      return this.compare(metricValue, condition.value, condition.operator);
    }

    if ("secret" in condition) {
      return Array.isArray(result.secretsFound)
        ? result.secretsFound.includes(condition.secret)
        : false;
    }

    return false;
  }

  private compare(a: unknown, b: unknown, operator: string): boolean {
    if (a === undefined || a === null) return false;
    const va = a as number | string | boolean;
    const vb = b as number | string | boolean;
    switch (operator) {
      case "==":
        return va === vb;
      case "!=":
        return va !== vb;
      case ">":
        return (va as number) > (vb as number);
      case ">=":
        return (va as number) >= (vb as number);
      case "<":
        return (va as number) < (vb as number);
      case "<=":
        return (va as number) <= (vb as number);
      default:
        return false;
    }
  }
}
