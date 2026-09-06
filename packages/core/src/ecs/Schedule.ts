import { ComponentRegistry } from "./Component";
import { EventRegistry } from "../events/EventBus";
import { System, SystemPhase, SystemConfig } from "./System";
import { World, BlueprintRegistryMap } from "./World";
import { RandomService } from "../utils/RandomService";

/**
 * Orchestrates and executes registered ECS systems sequentially grouped by phases and sorted by priority.
 *
 * @remarks
 * The `Schedule` manages system execution order across pre-defined phases:
 * 1. `Input`
 * 2. `Simulation`
 * 3. `Transform`
 * 4. `Collision`
 * 5. `GameRules`
 * 6. `Presentation`
 *
 * **Execution Invariants & Lifecycle Guarantees**:
 * - **Deterministic RNG Locking**: `world.gameplayRandom` is unlocked before running system updates and re-locked immediately upon phase completion to prevent non-deterministic random state mutations outside ticks.
 * - **Structural Command Buffer Invariant**: Marks `world.isUpdating = true` while invoking system updates. Any entity creation, destruction, or component addition/removal during update loops is deferred via `WorldCommandBuffer`.
 * - **Deferred Flush Trigger**: Calls `eventBus.flushDeferred()` and `world.flush()` at the end of each tick step to process buffered events and commit deferred structural changes safely.
 * - **Soft Pause / Gameplay Freeze Filter**: Handles `GameplayFreeze` resources, pausing `Input`, `Collision`, and `GameRules` phases while allowing select visual or presentation systems (`TTLSystem`, `JuiceSystem`) to continue updating.
 *
 * @public
 */
export class Schedule<
  TComponents extends ComponentRegistry = ComponentRegistry,
  TEvents extends EventRegistry = EventRegistry,
  TBlueprints extends BlueprintRegistryMap<TComponents, TEvents> = BlueprintRegistryMap<TComponents, TEvents>
> {
  private systems: { system: System<TComponents, TEvents>; phase: string; priority: number; group?: string }[] = [];
  private phases: string[];
  private phasedSystems = new Map<string, { system: System<TComponents, TEvents>; phase: string; priority: number; group?: string }[]>();

  /**
   * Initializes a new system execution schedule.
   *
   * @param phases - Optional custom ordered sequence of execution phases. Defaults to standard engine phases (`Input` -\> `Simulation` -\> `Transform` -\> `Collision` -\> `GameRules` -\> `Presentation`).
   */
  constructor(phases?: string[]) {
    this.phases = phases ?? [
      SystemPhase.Input,
      SystemPhase.Simulation,
      SystemPhase.Transform,
      SystemPhase.Collision,
      SystemPhase.GameRules,
      SystemPhase.Presentation
    ];
    this.rebuildPhasedSystems();
  }

  private rebuildPhasedSystems(): void {
    this.phasedSystems.clear();
    for (const phase of this.phases) {
      const list = this.systems
        .filter(s => s.phase === phase)
        .sort((a, b) => b.priority - a.priority);
      this.phasedSystems.set(phase, list);
    }
  }

  /**
   * Registers a system into the schedule and triggers its `onRegister` hook.
   *
   * @param system - The system instance to register.
   * @param config - Registration options specifying phase, priority, and optional group tag.
   * @param world - The target simulation `World`.
   */
  public addSystem(
    system: System<TComponents, TEvents>,
    config: SystemConfig = {},
    world: World<TComponents, TEvents, TBlueprints>
  ): void {
    this.systems.push({
      system,
      phase: (config.phase as string) ?? SystemPhase.Simulation,
      priority: config.priority ?? 0,
      group: config.group
    });
    system.onRegister(world);
    this.rebuildPhasedSystems();
  }

  /**
   * Returns all systems currently registered in this schedule.
   *
   * @returns Array of registered `System` instances.
   */
  public getSystems(): System<TComponents, TEvents>[] {
    return this.systems.map(s => s.system);
  }

  /**
   * Disposes and unregisters all systems.
   *
   * @remarks
   * Invokes the `dispose()` hook on every registered system before clearing the internal collections.
   */
  public clearSystems(): void {
    this.systems.forEach(s => s.system.dispose());
    this.systems = [];
    this.rebuildPhasedSystems();
  }

  /**
   * Executes one update step across all registered phases and systems in sequential order.
   *
   * @param world - The target simulation `World`.
   * @param deltaTime - Fixed time delta for this tick in seconds.
   */
  public update(
    world: World<TComponents, TEvents, TBlueprints>,
    deltaTime: number
  ): void {
    world.isUpdating = true;
    if (world.gameplayRandom) {
      world.gameplayRandom.unlock();
    }
    try {
      const timeScaleRes = world.getResource<import("../runtime/TimeScale").TimeScale>("TimeScale") || world.getResource<{ scale?: number; remainingDuration?: number }>("TimeScale");
      let effectiveTimeScale = 1.0;

      if (timeScaleRes) {
        if (typeof timeScaleRes.scale === "number") {
          effectiveTimeScale = timeScaleRes.scale;
        }
        if (typeof timeScaleRes.remainingDuration === "number") {
          timeScaleRes.remainingDuration = Math.max(0, timeScaleRes.remainingDuration - deltaTime);
          if (timeScaleRes.remainingDuration <= 0) {
            timeScaleRes.scale = 1.0;
            timeScaleRes.remainingDuration = undefined;
          }
        }
      }

      const freeze = world.getResource<{ remaining?: number }>("GameplayFreeze");
      if (freeze && typeof freeze.remaining === "number") {
        freeze.remaining = Math.max(0, freeze.remaining - deltaTime);
        if (freeze.remaining <= 0) {
          world.deleteResource("GameplayFreeze");
        }
      }

      const isPausedResource = world.getResource("IsPaused") === true;
      const isFrozen = world.getResource("GameplayFreeze") !== undefined || isPausedResource || effectiveTimeScale === 0;
      const scaledDeltaTime = deltaTime * effectiveTimeScale;

      const gameState = world.getSingleton("GameState" as Extract<keyof TComponents, string>) as unknown as { phase?: string } | undefined;
      let activeGroups = world.getResource<string[]>("ActiveGroups");
      if (gameState && gameState.phase) {
        if (gameState.phase === "PLAYING") {
          activeGroups = ["simulation", "presentation"];
        } else if (gameState.phase === "WAVE_TRANSITION") {
          activeGroups = ["transition", "presentation"];
        } else if (gameState.phase === "MUTATOR_DRAFT") {
          activeGroups = ["draft", "presentation"];
        }
      }

      for (const phase of this.phases) {
        if (isFrozen) {
          // Bypassed entirely during freeze: Input, Transform, Collision, GameRules
          if (phase === SystemPhase.Input || phase === SystemPhase.Transform || phase === SystemPhase.Collision || phase === SystemPhase.GameRules) {
            continue;
          }
        }

        const phaseSystems = this.phasedSystems.get(phase);
        if (phaseSystems) {
          for (let i = 0; i < phaseSystems.length; i++) {
            const sysRecord = phaseSystems[i];
            const sys = sysRecord.system;
            const className = sys.constructor.name;
            if (isFrozen && phase === SystemPhase.Simulation) {
              if (className !== "TTLSystem" && className !== "JuiceSystem" && className !== "ParticleSystem") {
                continue;
              }
            }
            if (activeGroups && sysRecord.group && !activeGroups.includes(sysRecord.group)) {
              continue;
            }
            const dtToPass = (phase === SystemPhase.Presentation || className === "TTLSystem" || className === "ParticleSystem")
              ? deltaTime
              : scaledDeltaTime;
            sys.update(world, dtToPass);
          }
        }
      }

      // Flush deferred events so they are processed in the current tick
      const eventBus = world.getEventBus ? world.getEventBus() : null;
      if (eventBus && typeof eventBus.flushDeferred === "function") {
        eventBus.flushDeferred();
      }
    } finally {
      world.isUpdating = false;
      if (world.gameplayRandom) {
        world.gameplayRandom.lock();
      }
    }
    world.flush();
  }
}
