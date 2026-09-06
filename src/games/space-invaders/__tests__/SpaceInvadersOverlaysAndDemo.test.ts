import { World, SystemPhase, EventBus } from "@tiny-aster/core";
import { SpaceInvadersGameStateSystem } from "../systems/SpaceInvadersGameStateSystem";
import { GameStateComponent, SpaceInvadersComponentRegistry } from "../types/SpaceInvadersTypes";
import { AttractModeController } from "@tiny-aster/gameplay-kit";

describe("Space Invaders HUD Overlays & Attract Mode Demo", () => {
  let world: World<SpaceInvadersComponentRegistry>;
  let gameStateSystem: SpaceInvadersGameStateSystem;

  beforeEach(() => {
    world = new World<SpaceInvadersComponentRegistry>();
    const eventBus = new EventBus();
    world.setResource("EventBus", eventBus);

    const mockGame = {
      isMultiplayer: false,
      isPaused: false,
      getWorld: () => world,
      setInputState: jest.fn(),
    } as any;

    gameStateSystem = new SpaceInvadersGameStateSystem(mockGame);
    world.addSystem(gameStateSystem, { phase: SystemPhase.GameRules });

    // Initialize GameState singleton
    world.setResource("GameConfig", { PLAYER_INITIAL_LIVES: 3 });
    const gameStateEntity = world.createEntity();
    world.addComponent(gameStateEntity, {
      type: "GameState",
      lives: 3,
      score: 0,
      level: 1,
      invadersRemaining: 0,
      isGameOver: false,
      screenShake: null,
      kamikazesActive: 0,
      readyRemaining: 3.0, // starts at 3
      intermissionRemaining: 0,
      continueCountdownRemaining: 0,
      continuesRemaining: 3,
    } as any);
  });

  it("should decrement readyRemaining timer on tick and stop when it reaches 0", () => {
    let state = world.getSingleton("GameState") as any;
    expect(state.readyRemaining).toBe(3.0);

    // Update 1.0 second
    world.update(1.0);
    state = world.getSingleton("GameState") as any;
    expect(state.readyRemaining).toBe(2.0);

    // Update 2.5 seconds -> should reach 0
    world.update(2.5);
    state = world.getSingleton("GameState") as any;
    expect(state.readyRemaining).toBe(0.0);
  });

  it("should transition to intermission and trigger stage:cleared upon spawn:wave_complete event", () => {
    const eventBus = world.getEventBus();
    let stageClearedEmitted = false;
    eventBus.on("stage:cleared", () => {
      stageClearedEmitted = true;
    });

    // Simulate spawn:wave_complete event
    eventBus.emit("spawn:wave_complete", {});
    world.update(0.016);

    const state = world.getSingleton("GameState") as any;
    expect(state.intermissionRemaining).toBeCloseTo(3.0 - 0.016, 5);
    expect(stageClearedEmitted).toBe(true);

    // Let it countdown
    world.update(1.0);
    expect((world.getSingleton("GameState") as any).intermissionRemaining).toBeCloseTo(3.0 - 1.016, 5);
  });

  it("should start continue countdown when lives reach 0, and player:continue event should restore state", () => {
    const eventBus = world.getEventBus();

    // Spawn a mock player with Health component
    const playerEntity = world.createEntity();
    world.addComponent(playerEntity, { type: "Player" } as any);
    world.addComponent(playerEntity, {
      type: "Health",
      current: 0,
      max: 3,
      invulnerableRemaining: 0,
    } as any);

    // Let state system process lives change
    world.mutateSingleton("GameState", (gs) => {
      gs.lives = 0;
    });

    world.update(0.1);

    let state = world.getSingleton("GameState") as any;
    expect(state.continueCountdownRemaining).toBe(9.0);
    expect(state.continuesRemaining).toBe(2); // decremented from 3 to 2

    // Decrement continues timer
    world.update(2.0);
    state = world.getSingleton("GameState") as any;
    expect(state.continueCountdownRemaining).toBeCloseTo(9.0 - 2.0, 5);

    // Trigger player:continue
    eventBus.emit("player:continue", {});
    world.update(0.016);

    state = world.getSingleton("GameState") as any;
    expect(state.lives).toBe(3);
    expect(state.continueCountdownRemaining).toBe(0.0);
    expect(state.isGameOver).toBe(false);

    const health = world.getComponent(playerEntity, "Health") as any;
    expect(health.current).toBe(3);
    expect(health.invulnerableRemaining).toBe(3.0);
  });

  it("should make AttractModeController feed simulated inputs to the game instance", () => {
    const mockGameInstance = {
      setInputState: jest.fn(),
    };
    const controller = new AttractModeController(mockGameInstance);
    controller.start();

    // Check it starts active
    expect(controller.isActive()).toBe(true);

    // First sequence item is moveLeft: true (for 1.5s)
    controller.update(0.5);
    expect(mockGameInstance.setInputState).toHaveBeenLastCalledWith({
      moveLeft: true,
      moveRight: false,
      shoot: false,
    });

    // Advance beyond 1.5s total -> should advance to second item: shoot: true (for 0.5s)
    controller.update(1.1);
    expect(mockGameInstance.setInputState).toHaveBeenLastCalledWith({
      moveLeft: false,
      moveRight: false,
      shoot: true,
    });

    controller.stop();
    expect(controller.isActive()).toBe(false);
    expect(mockGameInstance.setInputState).toHaveBeenLastCalledWith({
      moveLeft: false,
      moveRight: false,
      shoot: false,
    });
  });
});
