import { World, BaseGame, BaseGameStateSystem } from "@tiny-aster/core";
import { GameStateComponent, SpaceInvadersComponentRegistry, SpaceInvadersEventRegistry, GAME_CONFIG } from "../types/SpaceInvadersTypes";
import { SpaceInvadersConfig } from "../types/SpaceInvadersConfigSchema";
import { spawnInvaderWave } from "../EntityFactory";
import { ISpaceInvadersGame } from "../types/GameInterfaces";
import { BENEFICIAL_MUTATORS, NEGATIVE_MUTATORS } from "../../../utils/MutatorRegistry";

/**
 * System that manages the overall game state, level progression, and game over.
 */
export class SpaceInvadersGameStateSystem extends BaseGameStateSystem<GameStateComponent, SpaceInvadersComponentRegistry, SpaceInvadersEventRegistry> {
  constructor(private game: ISpaceInvadersGame) {
    super("GameState");
  }

  public override onRegister(world: World<SpaceInvadersComponentRegistry, SpaceInvadersEventRegistry>): void {
    super.onRegister(world);
    const eventBus = world.getEventBus();
    if (eventBus) {
      // 1. Listen to level:completed
      eventBus.on("level:completed", (event) => {
        try {
          if (world.isReSimulating) return;

          // Generate deterministic choices using world.gameplayRandom
          const rng = world.gameplayRandom;
          if (!rng) {
            throw new Error("world.gameplayRandom is undefined!");
          }

          const wasLocked = rng.isLocked();
          if (wasLocked) rng.unlock();

          try {
            const beneficialKeys = Object.keys(BENEFICIAL_MUTATORS).filter(key => {
              const m = BENEFICIAL_MUTATORS[key];
              return m.supportedGames.includes('ALL') || m.supportedGames.includes("space-invaders");
            }).sort();
            const negativeKeys = Object.keys(NEGATIVE_MUTATORS).filter(key => {
              const m = NEGATIVE_MUTATORS[key];
              return m.supportedGames.includes('ALL') || m.supportedGames.includes("space-invaders");
            }).sort();

            // Deterministic shuffle helper using rng
            const shuffle = <T>(array: T[], r: { next: () => number }): T[] => {
              const result = [...array];
              for (let i = result.length - 1; i > 0; i--) {
                const j = Math.floor(r.next() * (i + 1));
                const temp = result[i];
                result[i] = result[j];
                result[j] = temp;
              }
              return result;
            };

            const shuffledBeneficial = shuffle(beneficialKeys, rng);
            const shuffledNegative = shuffle(negativeKeys, rng);

            const choices = [
              shuffledBeneficial[0],
              shuffledBeneficial[1],
              shuffledNegative[0]
            ];

            // Store choices as resource
            world.setResource("RunMutatorChoices", {
              choices,
              active: true
            });

            // Pause simulation
            if (typeof this.game.pause === "function") {
              this.game.pause();
            }
          } finally {
            if (wasLocked) rng.lock();
          }
        } catch (err) {
          console.error("ERROR IN EVENT LISTENER:", err);
        }
      });

      // 2. Listen to spawn:wave_complete for Intermission / Stage Clear
      eventBus.on("spawn:wave_complete", () => {
        if (world.isReSimulating) return;
        world.mutateSingleton("GameState", (gs) => {
          gs.intermissionRemaining = 3.0; // 3 seconds intermission
          eventBus.emitDeferred("stage:cleared", { level: gs.level });
        });
      });

      // 3. Listen to player:continue
      eventBus.on("player:continue", () => {
        if (world.isReSimulating) return;
        world.mutateSingleton("GameState", (gs) => {
          gs.lives = 3;
          gs.continueCountdownRemaining = 0;
          gs.isGameOver = false;

          // Restore player health & give temporary invulnerability
          const playerEntities = world.query("Player", "Health");
          playerEntities.forEach(entity => {
            world.mutateComponent(entity, "Health", (h: any) => {
              h.current = h.max;
              h.invulnerableRemaining = 3.0; // 3 seconds invulnerability
            });
          });

          // Play confirm sound
          eventBus.emitDeferred("PlaySFX", { name: "shoot" });
        });
      });
    }
  }

  protected updateGameState(world: World<SpaceInvadersComponentRegistry>, gameState: GameStateComponent, deltaTime: number): void {
    // A. Handle ready countdown
    if (gameState.readyRemaining > 0) {
      world.mutateSingleton("GameState", (gs) => {
        gs.readyRemaining = Math.max(0, gs.readyRemaining - deltaTime);
      });
    }

    // B. Handle intermission countdown
    if (gameState.intermissionRemaining > 0) {
      world.mutateSingleton("GameState", (gs) => {
        gs.intermissionRemaining = Math.max(0, gs.intermissionRemaining - deltaTime);
      });
    }

    // C. Handle continue countdown
    if (gameState.continueCountdownRemaining > 0) {
      world.mutateSingleton("GameState", (gs) => {
        gs.continueCountdownRemaining = Math.max(0, gs.continueCountdownRemaining - deltaTime);
        if (gs.continueCountdownRemaining <= 0) {
          // Time expired! Final game over!
          gs.isGameOver = true;
          const eventBus = world.getEventBus();
          if (eventBus) {
            eventBus.emitDeferred("PlaySFX", { name: "game_over" });
          }
        }
      });
    }

    // 1. Count remaining invaders and wave members
    const activeMembers = world.query("WaveMember");
    const invaders = world.query("Invader");
    world.mutateSingleton("GameState", (gs) => {
        gs.invadersRemaining = activeMembers.length > 0 ? activeMembers.length : invaders.length;
    });

    // 2. Handle level progression driven by SpawnDirector waveIndex
    const directorEntity = world.query("SpawnDirector")[0];
    if (directorEntity !== undefined) {
      const director = world.getComponent(directorEntity, "SpawnDirector");
      if (director) {
        world.mutateSingleton("GameState", (gs) => {
          const nextLevel = director.waveIndex + 1;
          if (gs.level < nextLevel) {
            const oldLevel = gs.level;
            gs.level = nextLevel;

            // Sync totalInvaders on Formation entity
            const waveDefs = world.getResource<any[]>("WaveDefinitions");
            const waveDef = waveDefs ? (waveDefs[nextLevel - 1] || waveDefs.find((w: any) => w.id === `level_${nextLevel}`)) : undefined;
            const config = world.getResource<SpaceInvadersConfig>("GameConfig") || GAME_CONFIG;
            const newTotalInvaders = waveDef?.totalInvaders && waveDef.totalInvaders > 0
              ? waveDef.totalInvaders
              : config.INVADER_ROWS * config.INVADER_COLS;

            const formationEntities = world.query("Formation");
            if (formationEntities.length > 0) {
              world.mutateComponent(formationEntities[0], "Formation", (f) => {
                f.totalInvaders = newTotalInvaders;
              });
            }

            const eventBus = world.getEventBus();
            if (eventBus) {
              eventBus.emitDeferred("level:completed", { level: oldLevel, nextLevel: gs.level });
            }
          }
        });
      }
    }

    // D. Trigger Continue Countdown if player is out of lives but still has continues
    if (gameState.lives <= 0 && !gameState.isGameOver && gameState.continueCountdownRemaining <= 0) {
      if (gameState.continuesRemaining > 0) {
        world.mutateSingleton("GameState", (gs) => {
          gs.continuesRemaining--;
          gs.continueCountdownRemaining = 9.0; // 9 seconds
        });
      } else {
        // No continues left! Final game over
        world.mutateSingleton("GameState", (gs) => {
          gs.isGameOver = true;
        });
        const eventBus = world.getEventBus();
        if (eventBus) {
          eventBus.emitDeferred("PlaySFX", { name: "game_over" });
        }
      }
    }

    // 3. Update screen shake duration
    if (gameState.screenShake) {
      world.mutateSingleton("GameState", (gs) => {
          if (gs.screenShake) {
              gs.screenShake.elapsed = (gs.screenShake.elapsed ?? 0) + deltaTime;
              gs.screenShake.duration -= deltaTime;
              if (gs.screenShake.duration <= 0) {
                gs.screenShake = null;
              }
          }
      });
    }
  }

  protected getGameState(world: World<SpaceInvadersComponentRegistry>): GameStateComponent | undefined {
    return world.getSingleton("GameState");
  }

  protected evaluateGameOverCondition(state: GameStateComponent): boolean {
    // Only stop the loop when final isGameOver is set
    return state.isGameOver;
  }

  public resetGameOverState(world?: World<SpaceInvadersComponentRegistry>): void {
    const w = world || (this._world as World<SpaceInvadersComponentRegistry>);
    if (!w) return;
    w.mutateSingleton("GameState", (gameState) => {
        gameState.isGameOver = false;
        gameState.gameOverLogged = false;
        gameState.score = 0;
        gameState.level = 1;
        gameState.lives = 3;
        gameState.readyRemaining = 3.0;
        gameState.intermissionRemaining = 0;
        gameState.continueCountdownRemaining = 0;
        gameState.continuesRemaining = 3;
    });

    const comboEntities = w.query("Combo");
    const comboEntity = comboEntities[0];
    if (comboEntity !== undefined) {
      w.mutateComponent(comboEntity, "Combo", (c) => {
        c.combo = 0;
        c.multiplier = 1;
        c.timerRemaining = 0;
      });
    }
  }
}
