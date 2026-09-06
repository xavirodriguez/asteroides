import { World, SystemPhase, EventBus, BlueprintRegistry } from "@tiny-aster/core";
import { SpaceInvadersComponentRegistry } from "../types/SpaceInvadersTypes";
import { WaveTransitionSystem } from "../systems/WaveTransitionSystem";
import { SpaceInvadersGameStateSystem } from "../systems/SpaceInvadersGameStateSystem";
import { MutatorRegistry, BENEFICIAL_MUTATORS } from "../../../utils/MutatorRegistry";
import { SpawnDirectorSystem } from "@tiny-aster/gameplay-kit";
import { ComboSystem } from "@tiny-aster/core";
import { SpaceInvadersGame } from "../SpaceInvadersGame";

describe("Space Invaders GDD v2 Mutator Draft System", () => {
  let world: World<SpaceInvadersComponentRegistry>;
  let eventBus: EventBus;

  beforeEach(() => {
    world = new World<SpaceInvadersComponentRegistry>();
    eventBus = new EventBus();
    world.setResource("EventBus", eventBus);

    // Register simple blueprints
    const blueprints = new BlueprintRegistry<SpaceInvadersComponentRegistry, any, any>();

    blueprints.register("state", {
      spawn: (w: World<SpaceInvadersComponentRegistry>, entity: number, _args: {}) => {
        w.addComponent(entity, {
          type: "GameState",
          lives: 3,
          score: 0,
          level: 1,
          invadersRemaining: 0,
          isGameOver: false,
          screenShake: null,
          kamikazesActive: 0,
          phase: "PLAYING",
          waveTransitionRemaining: 0,
          readyRemaining: 0,
          intermissionRemaining: 0,
          continueCountdownRemaining: 0,
          continuesRemaining: 3
        } as any);

        w.addComponent(entity, {
          type: "SpawnDirector",
          waveIndex: 0,
          cooldownRemaining: 0,
          pendingSpawns: [],
          waveElapsedTime: 0,
          enemiesRemaining: 0,
          status: "idle"
        } as any);
      }
    });

    world.setResource("BlueprintRegistry", blueprints);
    world.setResource("GameConfig", { PLAYER_INITIAL_LIVES: 3, COMBO_TIMEOUT: 2000 });

    // Seed RandomService deterministically
    world.gameplayRandom.setSeed(12345);
    world.gameplayRandom.unlock();
  });

  it("should implement full state-machine transition from PLAYING to WAVE_TRANSITION to MUTATOR_DRAFT", () => {
    // Register systems with groups
    const waveTransitionSystem = new WaveTransitionSystem();
    const spawnDirectorSystem = new SpawnDirectorSystem();

    world.addSystem(waveTransitionSystem, { phase: SystemPhase.Simulation, group: "transition" });
    world.addSystem(spawnDirectorSystem, { phase: SystemPhase.Simulation, group: "simulation" });

    // 1. Create GameState
    const stateEntity = world.createEntity();
    const blueprints = world.getResource<any>("BlueprintRegistry");
    blueprints.get("state").spawn(world, stateEntity, {});

    const gs = world.getSingleton("GameState") as any;
    expect(gs.phase).toBe("PLAYING");

    // Create a player
    const playerEntity = world.createEntity();
    world.addComponent(playerEntity, { type: "Player" } as any);
    world.addComponent(playerEntity, { type: "Health", current: 3, max: 3 } as any);
    world.addComponent(playerEntity, { type: "Combo", combo: 0, multiplier: 1, timerRemaining: 0 } as any);

    // 2. Complete a wave -> Set GameState to WAVE_TRANSITION (duration 0.8s)
    world.mutateSingleton("GameState", (state: any) => {
      state.phase = "WAVE_TRANSITION";
      state.waveTransitionRemaining = 0.8;
    });

    // Run update for 0.4s
    world.update(0.4);
    expect((world.getSingleton("GameState") as any).phase).toBe("WAVE_TRANSITION");
    expect((world.getSingleton("GameState") as any).waveTransitionRemaining).toBeCloseTo(0.4, 5);

    // Check that during WAVE_TRANSITION, spawn director didn't update since it is in "simulation" group (which is gated!)
    const director = world.getComponent(stateEntity, "SpawnDirector" as any) as any;
    expect(director.waveIndex).toBe(0);

    // Run another 0.45s to expire the timer
    world.update(0.45);

    // 3. Must transition to MUTATOR_DRAFT
    const finalGs = world.getSingleton("GameState") as any;
    expect(finalGs.phase).toBe("MUTATOR_DRAFT");
    expect(finalGs.waveTransitionRemaining).toBe(0);

    // Player should now have a distinct DraftState attached
    const draft = world.getComponent(playerEntity, "DraftState" as any) as any;
    expect(draft).toBeDefined();
    expect(draft.options.length).toBe(3);
    expect(draft.hasChosen).toBe(false);
    expect(draft.selectedMutatorId).toBeNull();
  });

  it("should select and apply a mutator, perform server-side validation, and resume to PLAYING", async () => {
    // Instantiate a real headless SpaceInvadersGame for authentic end-to-end validation testing
    const game = new SpaceInvadersGame({
      headless: true,
      isMultiplayer: false,
      gameOptions: { seed: 12345 }
    });

    await game.init();

    const gameWorld = game.getWorld();
    const playerEntity = gameWorld.query("Player")[0];
    expect(playerEntity).toBeDefined();

    // Force MUTATOR_DRAFT phase
    gameWorld.mutateSingleton("GameState", (state: any) => {
      state.phase = "MUTATOR_DRAFT";
    });

    // Offer choices: extra_life, faster_bullets
    gameWorld.addComponent(playerEntity, {
      type: "DraftState",
      options: ["extra_life", "faster_bullets"],
      hasChosen: false,
      selectedMutatorId: null
    } as any);

    // Trigger select with invalid/unoffered mutator -> validation must reject it
    const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    game.selectRunMutator("shield_pulse");
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("seleccionó un mutador no ofrecido"));
    consoleWarnSpy.mockRestore();

    // Verify player is unchanged
    let health = gameWorld.getComponent(playerEntity, "Health" as any) as any;
    const initialHp = health.current;

    // Select valid mutator: extra_life
    game.selectRunMutator("extra_life");

    // Check mutator was applied: health increased
    health = gameWorld.getComponent(playerEntity, "Health" as any) as any;
    expect(health.current).toBe(initialHp + 1);

    // GameState phase must return to 'PLAYING'
    const gs = game.getGameState();
    expect((gs as any).phase).toBe("PLAYING");

    // DraftState should be removed from player once chosen
    expect(gameWorld.hasComponent(playerEntity, "DraftState" as any)).toBe(false);

    game.destroy();
  });

  it("should generate deterministic draft options based on gameplayRandom seed and rarity weights", () => {
    // Generate draft options for player context
    const playerEntity = world.createEntity();
    world.addComponent(playerEntity, { type: "Player" } as any);
    world.addComponent(playerEntity, { type: "Health", current: 3, max: 3 } as any);
    world.addComponent(playerEntity, { type: "Combo", combo: 0, multiplier: 1, timerRemaining: 0 } as any);

    const context = {
      playerId: "player_test",
      targetEntity: playerEntity
    };

    // Set seed A
    world.gameplayRandom.setSeed(42);
    const draftA = MutatorRegistry.generateDraft(world, "space-invaders", 3, context);
    expect(draftA.length).toBe(3);

    // Regenerate with same seed -> must yield identical options (determinism!)
    world.gameplayRandom.setSeed(42);
    const draftB = MutatorRegistry.generateDraft(world, "space-invaders", 3, context);
    expect(draftB.map(m => m.id)).toEqual(draftA.map(m => m.id));

    // Regenerate with different seed -> should yield different options
    world.gameplayRandom.setSeed(999);
    const draftC = MutatorRegistry.generateDraft(world, "space-invaders", 3, context);
    expect(draftC.map(m => m.id)).not.toEqual(draftA.map(m => m.id));
  });

  it("should support snapshot and restore of draft state and gameplayRandom internal LCG seed", () => {
    // 1. Create a draft in progress
    const stateEntity = world.createEntity();
    const blueprints = world.getResource<any>("BlueprintRegistry");
    blueprints.get("state").spawn(world, stateEntity, {});

    const playerEntity = world.createEntity();
    world.addComponent(playerEntity, { type: "Player" } as any);
    world.addComponent(playerEntity, { type: "Health", current: 3, max: 3 } as any);

    world.mutateSingleton("GameState", (state: any) => {
      state.phase = "MUTATOR_DRAFT";
    });

    world.addComponent(playerEntity, {
      type: "DraftState",
      options: ["faster_bullets", "combo_head_start"],
      hasChosen: false,
      selectedMutatorId: null
    } as any);

    // Consume some RNG calls to advance LCG
    world.gameplayRandom.unlock();
    const rng1 = world.gameplayRandom.next();
    const rng2 = world.gameplayRandom.next();

    // Take snapshot of the world
    const snapshot = world.snapshot();

    // Create a new world and restore snapshot
    const secondWorld = new World<SpaceInvadersComponentRegistry>();
    secondWorld.restore(snapshot);
    secondWorld.gameplayRandom.unlock();

    // Verify components and draft state are fully restored
    const restoredGs = secondWorld.getSingleton("GameState") as any;
    expect(restoredGs.phase).toBe("MUTATOR_DRAFT");

    const restoredPlayer = secondWorld.query("Player")[0];
    const restoredDraft = secondWorld.getComponent(restoredPlayer, "DraftState" as any) as any;
    expect(restoredDraft).toBeDefined();
    expect(restoredDraft.options).toEqual(["faster_bullets", "combo_head_start"]);

    // Verify gameplayRandom LCG state is perfectly synchronized under rollback simulation
    const restoredRng1 = secondWorld.gameplayRandom.next();
    const restoredRng2 = secondWorld.gameplayRandom.next();

    // Call after snapshot on original world
    const origRng1 = world.gameplayRandom.next();
    const origRng2 = world.gameplayRandom.next();

    expect(restoredRng1).toBe(origRng1);
    expect(restoredRng2).toBe(origRng2);
  });
});
