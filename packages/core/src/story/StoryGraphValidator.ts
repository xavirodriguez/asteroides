import { StoryGraph, StoryCondition, StoryEffect } from "./StoryTypes";

/**
 * Validator Responsibility: Pure Story Graph Topology & State Key Linting Layer.
 *
 * Validates pure `StoryGraph` assets for entry point validity, broken transitions, orphan nodes, dead ends, and state keys.
 * Distinct from `SemanticValidator` (encounter DSL rules) and `StoryPackageValidator` (package bundle manifest & cross-references).
 */

/**
 * Validation options supplied to `StoryGraphValidator`.
 *
 * @public
 */
export interface StoryGraphValidationOptions {
  /** Optional list of declared variable keys in initial state schema. */
  declaredVariables?: string[];
  /** Optional list of declared flag keys in initial state schema. */
  declaredFlags?: string[];
}

/**
 * Error or warning descriptor produced by `StoryGraphValidator`.
 *
 * @public
 */
export interface StoryGraphValidationError {
  /** Categorical code describing the validation issue type. */
  type:
    | "orphan_node"
    | "broken_transition"
    | "dead_end"
    | "undeclared_variable"
    | "undeclared_flag"
    | "invalid_entry_node";
  /** Severity level (`error` blocks graph loading, `warning` highlights potential dead ends or unreachable content). */
  severity: "error" | "warning";
  /** ID of the node where the issue was detected. */
  nodeId?: string;
  /** ID of the missing target node if transition is broken. */
  targetNodeId?: string;
  /** Variable or flag key name if undeclared. */
  variableKey?: string;
  /** Human-readable explanation of the validation defect. */
  message: string;
}

/**
 * Result structure returned by `StoryGraphValidator`.
 *
 * @public
 */
export interface StoryGraphValidationResult {
  /** True if zero errors were discovered during graph validation. */
  valid: boolean;
  /** List of critical structural errors that prevent graph execution. */
  errors: StoryGraphValidationError[];
  /** List of non-critical warnings (e.g. unreachable orphan nodes or dead ends). */
  warnings: StoryGraphValidationError[];
}

/**
 * Static linter utility for pure `StoryGraph` narrative structures.
 *
 * @remarks
 * Performs compile-time and load-time static analysis on narrative graph assets without mutating runtime state.
 * Detects structural issues such as invalid entry nodes, broken transitions, orphan nodes, unmarked dead ends,
 * and undeclared state variables or flags.
 *
 * @public
 */
export class StoryGraphValidator {
  /**
   * Validates a pure `StoryGraph` asset against structural invariants.
   *
   * @param graph - The narrative `StoryGraph` asset definition to validate.
   * @param options - Optional declared state variables and flags schema for undeclared key checking.
   * @returns Validation result containing validity status, error list, and warning list.
   */
  public static validate(
    graph: StoryGraph,
    options?: StoryGraphValidationOptions
  ): StoryGraphValidationResult {
    const errors: StoryGraphValidationError[] = [];
    const warnings: StoryGraphValidationError[] = [];

    if (!graph || !graph.nodes) {
      errors.push({
        type: "invalid_entry_node",
        severity: "error",
        message: "StoryGraph missing nodes map."
      });
      return { valid: false, errors, warnings };
    }

    // 1. Check Entry Node validity
    if (!graph.entryNodeId || !graph.nodes[graph.entryNodeId]) {
      errors.push({
        type: "invalid_entry_node",
        severity: "error",
        nodeId: graph.entryNodeId,
        message: `Entry node '${graph.entryNodeId}' does not exist in graph nodes.`
      });
    }

    const referencedNodeIds = new Set<string>();
    if (graph.entryNodeId) {
      referencedNodeIds.add(graph.entryNodeId);
    }

    const inspectCondition = (cond: StoryCondition | undefined, nodeId: string) => {
      if (!cond) return;

      if (cond.type === "variable" && cond.key) {
        if (
          options?.declaredVariables &&
          !options.declaredVariables.includes(cond.key)
        ) {
          errors.push({
            type: "undeclared_variable",
            severity: "error",
            nodeId,
            variableKey: cond.key,
            message: `Condition in node '${nodeId}' references undeclared variable '${cond.key}'.`
          });
        }
      }

      if (cond.type === "flag" && cond.key) {
        if (
          options?.declaredFlags &&
          !options.declaredFlags.includes(cond.key) &&
          !cond.key.startsWith("event:")
        ) {
          warnings.push({
            type: "undeclared_flag",
            severity: "warning",
            nodeId,
            variableKey: cond.key,
            message: `Condition in node '${nodeId}' references undeclared flag '${cond.key}'.`
          });
        }
      }
    };

    const inspectEffects = (effects: StoryEffect[] | undefined, nodeId: string) => {
      if (!effects) return;
      for (const effect of effects) {
        if (effect.type === "setVariable" || effect.type === "incrementVariable") {
          if (options?.declaredVariables && !options.declaredVariables.includes(effect.key)) {
            errors.push({
              type: "undeclared_variable",
              severity: "error",
              nodeId,
              variableKey: effect.key,
              message: `Effect in node '${nodeId}' references undeclared variable '${effect.key}'.`
            });
          }
        } else if (effect.type === "setFlag") {
          if (options?.declaredFlags && !options.declaredFlags.includes(effect.key)) {
            warnings.push({
              type: "undeclared_flag",
              severity: "warning",
              nodeId,
              variableKey: effect.key,
              message: `Effect in node '${nodeId}' references undeclared flag '${effect.key}'.`
            });
          }
        }
      }
    };

    // 2. Inspect all nodes for broken transitions, choices, dead ends, and condition variables
    for (const nodeId in graph.nodes) {
      const node = graph.nodes[nodeId];
      let hasOutgoing = false;

      inspectEffects(node.effects, nodeId);

      // Check transitions
      if (node.transitions && node.transitions.length > 0) {
        hasOutgoing = true;
        for (const transition of node.transitions) {
          referencedNodeIds.add(transition.targetNodeId);
          if (!graph.nodes[transition.targetNodeId]) {
            errors.push({
              type: "broken_transition",
              severity: "error",
              nodeId,
              targetNodeId: transition.targetNodeId,
              message: `Transition in node '${nodeId}' points to non-existent node '${transition.targetNodeId}'.`
            });
          }
          inspectCondition(transition.condition, nodeId);
        }
      }

      // Check choices
      if (node.choices && node.choices.length > 0) {
        hasOutgoing = true;
        for (const choice of node.choices) {
          referencedNodeIds.add(choice.targetNodeId);
          if (!graph.nodes[choice.targetNodeId]) {
            errors.push({
              type: "broken_transition",
              severity: "error",
              nodeId,
              targetNodeId: choice.targetNodeId,
              message: `Choice in node '${nodeId}' points to non-existent node '${choice.targetNodeId}'.`
            });
          }
          inspectCondition(choice.condition, nodeId);
          inspectEffects(choice.effects, nodeId);
        }
      }

      // Check dead ends
      const isTerminal =
        node.isEndNode === true ||
        node.meta?.isEndNode === true ||
        (node.type as string) === "end";

      if (!hasOutgoing && !isTerminal) {
        warnings.push({
          type: "dead_end",
          severity: "warning",
          nodeId,
          message: `Node '${nodeId}' is a dead end without outgoing transitions and is not marked as end node.`
        });
      }
    }

    // 3. Detect orphan nodes
    for (const nodeId in graph.nodes) {
      if (nodeId !== graph.entryNodeId && !referencedNodeIds.has(nodeId)) {
        warnings.push({
          type: "orphan_node",
          severity: "warning",
          nodeId,
          message: `Node '${nodeId}' is orphaned and unreachable from entry node or any transition.`
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
}
