import { Scene } from "./Scene";
import { World } from "../ecs/World";
import { StoryRuntime } from "../story/StoryRuntime";
import { StoryNode, StoryChoice } from "../story/StoryTypes";

/**
 * CYOAScene provides a lightweight, view-focused Scene representation
 * for text-based "Choose Your Own Adventure" interactive stories.
 *
 * @remarks
 * Does not instantiate heavy physics or arcade gameplay ECS systems.
 * Subscribes to narrative events via `EventBus` and coordinates progression
 * directly through `StoryRuntime`.
 *
 * @public
 */
export class CYOAScene extends Scene {
  private runtime: StoryRuntime;
  private currentNode: StoryNode | null = null;
  private onNodeChangedCallback?: (node: StoryNode) => void;

  /**
   * Constructs a new `CYOAScene` instance.
   *
   * @param world - ECS World container associated with the scene.
   * @param runtime - Active `StoryRuntime` instance driving the narrative.
   * @param onNodeChanged - Optional UI listener callback notified whenever node changes.
   */
  constructor(
    world: World,
    runtime: StoryRuntime,
    onNodeChanged?: (node: StoryNode) => void
  ) {
    super(world);
    this.name = "CYOA Story Scene";
    this.runtime = runtime;
    this.onNodeChangedCallback = onNodeChanged;
  }

  /**
   * Initializes scene and binds event listeners to EventBus and StoryRuntime.
   */
  public override onEnter(world: World): void {
    this.runtime.bindWorld(world);

    const eventBus = world.getEventBus();
    if (eventBus) {
      eventBus.on("story:node_changed", (event) => {
        const node = (event as { node?: StoryNode })?.node;
        if (node) {
          this.currentNode = node;
          if (this.onNodeChangedCallback) {
            this.onNodeChangedCallback(node);
          }
        }
      });
    }

    this.currentNode = this.runtime.getCurrentNode();
    if (this.currentNode && this.onNodeChangedCallback) {
      this.onNodeChangedCallback(this.currentNode);
    }
  }

  /**
   * Selects a narrative choice by ID and delegates progression to `StoryRuntime`.
   *
   * @param choiceId - Identifier of choice option selected by user.
   * @returns Boolean indicating whether choice selection succeeded.
   */
  public selectChoice(choiceId: string): boolean {
    return this.runtime.selectChoice(choiceId);
  }

  /**
   * Retrieves the current active `StoryNode` rendered by this scene.
   */
  public getCurrentNode(): StoryNode | null {
    return this.runtime.getCurrentNode() || this.currentNode;
  }

  /**
   * Evaluates available choices for the current active node, filtering out options
   * whose conditions do not evaluate to true in `StoryRuntime`.
   */
  public getAvailableChoices(): StoryChoice[] {
    const node = this.getCurrentNode();
    if (!node || node.type !== "choice" || !node.choices) {
      return [];
    }

    return node.choices.filter((choice) => {
      if (!choice.condition) return true;
      return this.runtime.evaluateCondition(choice.condition);
    });
  }

  /**
   * Retrieves the `StoryRuntime` attached to this scene.
   */
  public getRuntime(): StoryRuntime {
    return this.runtime;
  }

  /**
   * Restores narrative story graph to initial entry node.
   */
  public override async restart(): Promise<void> {
    const graph = this.runtime.getGraph();
    if (graph) {
      this.runtime.loadGraph(graph, true);
    }
  }
}
