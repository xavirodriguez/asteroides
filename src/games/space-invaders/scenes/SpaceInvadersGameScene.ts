import {
  Scene,
  World,
  EventBus,
  BaseGame,
  MovementSystem,
  TTLSystem,
  JuiceSystem,
  RenderUpdateSystem,
  BoundarySystem,
  CollisionSystem2D,
  MutatorSystem,
  SystemPhase,
  HierarchySystem
} from "@tiny-aster/core";
import { BENEFICIAL_MUTATORS } from "../../../utils/MutatorRegistry";
import { ComboSystem } from "@tiny-aster/core";
import { LootSystem, PowerUpSystem, DifficultyDirectorSystem, AchievementSystem } from "@tiny-aster/gameplay-kit";
import { SpaceInvadersComponentRegistry } from "../types/SpaceInvadersTypes";
import { SpaceInvadersInputSystem } from "../systems/SpaceInvadersInputSystem";
import { SpaceInvadersFormationSystem } from "../systems/SpaceInvadersFormationSystem";
import { SpaceInvadersCollisionSystem } from "../systems/SpaceInvadersCollisionSystem";
import { SpaceInvadersGameStateSystem } from "../systems/SpaceInvadersGameStateSystem";
import { SpaceInvadersRenderSystem } from "../systems/SpaceInvadersRenderSystem";
import { ComboHUDRenderSystem } from "../systems/ComboHUDRenderSystem";
import { InvulnerabilitySystem } from "../systems/InvulnerabilitySystem";
import { CombatSystem } from "@tiny-aster/gameplay-kit";
import { WaveTransitionSystem } from "../systems/WaveTransitionSystem";
import { SpawnDirectorSystem } from "@tiny-aster/gameplay-kit";
import { KamikazeSystem } from "../systems/KamikazeSystem";
import { BossSystem } from "../systems/BossSystem";
import { PlayerBulletPool, EnemyBulletPool, ParticlePool } from "../EntityPool";
import {
  createPlayer,
  createGameState,
  createFormationController,
  spawnInvaderWave,
  spawnShields
} from "../EntityFactory";
import { SpaceInvadersConfig } from "../types/SpaceInvadersConfigSchema";
import { GAME_CONFIG } from "../types/SpaceInvadersTypes";
import { ISpaceInvadersGame } from "../types/GameInterfaces";

/**
 * Main gameplay scene for Space Invaders.
 */
export class SpaceInvadersGameScene extends Scene<SpaceInvadersComponentRegistry> {
  private game: ISpaceInvadersGame;
  private playerBulletPool: PlayerBulletPool;
  private enemyBulletPool: EnemyBulletPool;
  private particlePool: ParticlePool;
  private config: SpaceInvadersConfig;

  constructor(
    game: ISpaceInvadersGame,
    playerBulletPool: PlayerBulletPool,
    enemyBulletPool: EnemyBulletPool,
    particlePool: ParticlePool,
    config?: SpaceInvadersConfig,
    world?: World<SpaceInvadersComponentRegistry>
  ) {
    const targetWorld = world || new World<SpaceInvadersComponentRegistry>();
    super(targetWorld);
    this.game = game;
    this.playerBulletPool = playerBulletPool;
    this.enemyBulletPool = enemyBulletPool;
    this.particlePool = particlePool;
    this.config = config || targetWorld.getResource<SpaceInvadersConfig>("GameConfig")!;
  }

  public onEnter(): void {
    // Inject resources into the scene world
    this.world.setResource("GameConfig", this.config);
    this.world.setResource("ScreenConfig", { width: GAME_CONFIG.SCREEN_WIDTH, height: GAME_CONFIG.SCREEN_HEIGHT });

    // Generate procedural Wave Definitions
    const waveDefs: any[] = [];
    const maxLevels = 50;
    const config = this.config || GAME_CONFIG;
    const startX = config.INVADER_START_X;
    const startY = config.INVADER_START_Y;
    const spacingX = config.INVADER_SPACING_X;
    const spacingY = config.INVADER_SPACING_Y;
    const rows = config.INVADER_ROWS;
    const cols = config.INVADER_COLS;

    for (let lvl = 1; lvl <= maxLevels; lvl++) {
      const isBoss = lvl % 5 === 0;
      if (isBoss) {
        waveDefs.push({
          id: `level_${lvl}`,
          cooldown: 2.0,
          isBossWave: true,
          spawns: [
            { blueprintId: "boss", args: { level: lvl }, delay: 0.0 }
          ]
        });
      } else {
        const spawns: any[] = [];
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            spawns.push({
              blueprintId: "invader",
              args: {
                x: startX + col * spacingX,
                y: startY + row * spacingY,
                row,
                col
              },
              delay: 0.0
            });
          }
        }
        waveDefs.push({
          id: `level_${lvl}`,
          cooldown: 2.0,
          spawns
        });
      }
    }
    this.world.setResource("WaveDefinitions", waveDefs);

    const eventBus = (this.game as unknown as { eventBus: EventBus }).eventBus;
    if (eventBus) {
      this.world.setResource("EventBus", eventBus);
    }
    const blueprints = (this.game as unknown as { blueprints: any }).blueprints;
    if (blueprints) {
      this.world.setResource("BlueprintRegistry", blueprints);
    }
    const inputSystem = (this.game as unknown as { unifiedInput: any }).unifiedInput;
    if (inputSystem) {
      this.world.setResource("InputSystem", inputSystem);
    }

    this.world.setResource("PlayerBulletPool", this.playerBulletPool);
    this.world.setResource("EnemyBulletPool", this.enemyBulletPool);
    this.world.setResource("ParticlePool", this.particlePool);

    // 1. Systems registration
    const inputSys = new SpaceInvadersInputSystem(this.playerBulletPool);
    if (this.game.isMultiplayer) inputSys.setMultiplayerMode(true);

    this.world.addSystem(inputSys, { phase: SystemPhase.Simulation, group: "simulation" });
    this.world.addSystem(new MovementSystem(), { phase: SystemPhase.Simulation, group: "simulation" });
    this.world.addSystem(new BoundarySystem(), { phase: SystemPhase.Simulation, group: "simulation" });
    this.world.addSystem(new HierarchySystem(), { phase: SystemPhase.Transform, group: "simulation" });
    this.world.addSystem(new SpaceInvadersFormationSystem(this.enemyBulletPool), { phase: SystemPhase.Simulation, group: "simulation" });
    this.world.addSystem(new InvulnerabilitySystem(), { phase: SystemPhase.Simulation, group: "simulation" });
    this.world.addSystem(new SpawnDirectorSystem(), { phase: SystemPhase.Simulation, group: "simulation" });
    this.world.addSystem(new CollisionSystem2D(), { phase: SystemPhase.Collision, group: "simulation" });
    this.world.addSystem(new CombatSystem(), { phase: SystemPhase.Collision, group: "simulation" });
    this.world.addSystem(new SpaceInvadersCollisionSystem(this.particlePool), { phase: SystemPhase.GameRules, group: "simulation" });
    this.world.addSystem(new KamikazeSystem(), { phase: SystemPhase.Simulation, group: "simulation" });
    this.world.addSystem(new BossSystem(), { phase: SystemPhase.Simulation, group: "simulation" });
    this.world.addSystem(new ComboSystem(), { phase: SystemPhase.Simulation, group: "simulation" });
    this.world.addSystem(new LootSystem() as any, { phase: SystemPhase.GameRules, group: "simulation" });
    this.world.addSystem(new PowerUpSystem() as any, { phase: SystemPhase.Simulation, group: "simulation" });
    this.world.addSystem(new TTLSystem(), { phase: SystemPhase.Simulation, group: "simulation" });
    this.world.addSystem(new SpaceInvadersGameStateSystem(this.game), { phase: SystemPhase.GameRules, group: "simulation" });
    this.world.addSystem(new DifficultyDirectorSystem(), { phase: SystemPhase.GameRules, group: "simulation" });
    this.world.addSystem(new AchievementSystem(), { phase: SystemPhase.Simulation, group: "simulation" });

    const mutators = (this.game as any)._config.gameOptions?.mutators || (this.game as any)._config.gameOptions?.activeMutators || [];
    this.world.addSystem(new MutatorSystem(mutators), { phase: SystemPhase.Simulation, group: "simulation" });

    // New WaveTransitionSystem
    this.world.addSystem(new WaveTransitionSystem(), { phase: SystemPhase.Simulation, group: "transition" });

    // Visual / Presentation Systems
    this.world.addSystem(new JuiceSystem(), { phase: SystemPhase.Presentation, group: "presentation" });
    this.world.addSystem(new RenderUpdateSystem(), { phase: SystemPhase.Presentation, group: "presentation" }); // No trails
    this.world.addSystem(new SpaceInvadersRenderSystem(), { phase: SystemPhase.Presentation, group: "presentation" });
    this.world.addSystem(new ComboHUDRenderSystem(), { phase: SystemPhase.Presentation, group: "presentation" });

    // 2. Initial entities
    if (this.game.isMultiplayer) return; // Wait for server state

    // Apply beneficial mutators if any are active before creating entities so they can set resources (e.g. HasComboHeadStart)
    const activeMutators = (this.game as any)._config.gameOptions?.mutators || (this.game as any)._config.gameOptions?.activeMutators || [];
    const beneficial = (this.game as any)._config.gameOptions?.beneficialMutators || [];

    const beneficialSet = new Set<string>();
    for (const m of activeMutators) {
      const id = typeof m === "string" ? m : m?.id;
      if (id && BENEFICIAL_MUTATORS[id]) {
        beneficialSet.add(id);
      }
    }
    for (const bId of beneficial) {
      if (typeof bId === "string" && BENEFICIAL_MUTATORS[bId]) {
        beneficialSet.add(bId);
      }
    }

    for (const bId of beneficialSet) {
      BENEFICIAL_MUTATORS[bId].apply(this.world);
    }

    const isHeadless = (this.game as any)._config?.headless === true;
    this.world.setResource("IsHeadless", isHeadless);

    createGameState(this.world);
    createPlayer(this.world, GAME_CONFIG.SCREEN_CENTER_X, GAME_CONFIG.SCREEN_HEIGHT - 50);
    createFormationController(this.world);
    spawnShields(this.world);
  }

  public override onExit(world: World): void {
    (this.playerBulletPool as any).clear?.();
    (this.enemyBulletPool as any).clear?.();
    (this.particlePool as any).clear?.();

    world.deleteResource("PlayerBulletPool");
    world.deleteResource("EnemyBulletPool");
    world.deleteResource("ParticlePool");
  }
}
