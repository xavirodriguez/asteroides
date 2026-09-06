import { World, GameLoop, BaseGame, WorldSnapshot, Component, EventBus, UnifiedInputSystem, InputSystem, ConfigService, Renderer, NetworkManager, LocalPredictionSystem, RemoteInterpolationSystem, MutatorSystem, SystemPhase, createEmitter, RendererUtils, NetworkController, InputFrame, WebAudioPlayer, ReplayRecorder, ReplayPlayer, NullBaseGame, loadAudioAssets } from "@tiny-aster/core";
import { ComboSystem } from "@tiny-aster/core";
import { LootSystem, PowerUpSystem, PowerUpEffectRegistry } from "@tiny-aster/gameplay-kit";
import { EnemyFactory } from "./EnemyFactory";
import { BENEFICIAL_MUTATORS, NEGATIVE_MUTATORS, MutatorRegistry, registerMutatorHook } from "../../utils/MutatorRegistry";
import { resolveAndApplyMutators } from "../../config/MutatorConfig";
/* eslint-disable @typescript-eslint/no-require-imports */
import { GameStateComponent, InputState, INITIAL_GAME_STATE, SpaceInvadersComponentRegistry, GAME_CONFIG, BossComponent } from "./types/SpaceInvadersTypes";
import { createThemeFromGameAccents } from "../../theme/gameAccents";
import { SpaceInvadersConfigSchema, SpaceInvadersConfig } from "./types/SpaceInvadersConfigSchema";
import { ISpaceInvadersGame } from "./types/GameInterfaces";
import { PlayerBulletPool, EnemyBulletPool, ParticlePool } from "./EntityPool";
import { SpaceInvadersGameScene } from "./scenes/SpaceInvadersGameScene";
import * as SharedVFX from "../shared/rendering/SharedVFX";
import spaceInvadersConfigRaw from "./config/space-invaders.json";

const __DEV__ = process.env.NODE_ENV !== "production";

/**
 * Main controller for the Space Invaders game.
 *
 * @remarks
 * Manages the enemy horde lifecycle and wave progression.
 * Unlike Asteroids, it uses a rigid formation system where the movement
 * of one entity affects the whole group (Swarm movement).
 */
import { TransformComponent, VelocityComponent, RenderComponent, ColliderComponent, CircleShape, BoxShape, ShapeType, CollisionEventsComponent, HealthComponent, BoundaryComponent, BlueprintDefinition, Theme, resolveThemeColor, EntityBuilder } from "@tiny-aster/core";
import { CollisionLayers } from "@tiny-aster/gameplay-kit";
import { FactionComponent, DamageComponent } from "@tiny-aster/gameplay-kit";

export interface SpaceInvadersBlueprintMap extends Record<string, BlueprintDefinition<SpaceInvadersComponentRegistry, any, any>> {
  player: BlueprintDefinition<SpaceInvadersComponentRegistry, any, { x: number, y: number }>;
  invader: BlueprintDefinition<SpaceInvadersComponentRegistry, any, { x: number, y: number, row: number, col: number }>;
  shield: BlueprintDefinition<SpaceInvadersComponentRegistry, any, { x: number, y: number, row: number, col: number }>;
  state: BlueprintDefinition<SpaceInvadersComponentRegistry, any, {}>;
  formation: BlueprintDefinition<SpaceInvadersComponentRegistry, any, {}>;
  player_bullet: BlueprintDefinition<SpaceInvadersComponentRegistry, any, { x: number, y: number }>;
  enemy_bullet: BlueprintDefinition<SpaceInvadersComponentRegistry, any, { x: number, y: number }>;
}

export class SpaceInvadersGame
  extends BaseGame<GameStateComponent, InputState, SpaceInvadersComponentRegistry, any, SpaceInvadersBlueprintMap>
  implements ISpaceInvadersGame {

  public isMultiplayer = false;
  private isHeadless = false;
  private playerBulletPool!: PlayerBulletPool;
  private enemyBulletPool!: EnemyBulletPool;
  private particlePool!: ParticlePool;
  private networkManager!: NetworkManager<any>;
  public readonly gameId = "space-invaders";
  private baseConfig: SpaceInvadersConfig;
  private config!: SpaceInvadersConfig;
  private network: NetworkController<SpaceInvadersComponentRegistry>;

  constructor(config: { isMultiplayer?: boolean, seed?: number, gameOptions?: Record<string, unknown>, headless?: boolean, schedule?: any, audio?: any, theme?: Theme } = {}) {
    const seed = config.gameOptions?.seed as number || config.seed;
    const loadedBaseConfig = ConfigService.load<SpaceInvadersConfig>(
      "space-invaders",
      SpaceInvadersConfigSchema,
      config.gameOptions?.rawConfig ?? spaceInvadersConfigRaw
    );
    super({
      pauseKey: loadedBaseConfig.KEYS.PAUSE,
      restartKey: loadedBaseConfig.KEYS.RESTART,
      isMultiplayer: config.isMultiplayer,
      headless: config.headless,
      schedule: config.schedule,
      theme: config.theme ?? createThemeFromGameAccents("space-invaders"),
      gameOptions: { ...config.gameOptions, seed },
      audio: config.audio || new WebAudioPlayer()
    });
    this.baseConfig = loadedBaseConfig;
    this.config = this.baseConfig;
    this.isHeadless = !!config.headless;
    this.isMultiplayer = !!config.isMultiplayer;
    this.network = new NetworkController<SpaceInvadersComponentRegistry>(this.world);
  }

  public applyInputToEntity(entityId: number, input: InputFrame) {
    const activeWorld = this.getWorld();
    const activeNetwork = new NetworkController<SpaceInvadersComponentRegistry>(activeWorld);
    activeNetwork.applyInputToEntity(entityId, input);
  }

  public predictLocalPlayer(input: InputFrame, deltaTime: number) {
    // TODO(refactor): código duplicado detectado (bloque) con geometrywars/GeometryWarsGame.ts:125-137. Considerar extraer a función compartida. Ref: 1390215f
    this.network.predictLocalPlayer(input, deltaTime);
  }

  public runSimulationStep(deltaTime: number, isResimulating: boolean) {
    const activeWorld = this.getWorld();
    const random = activeWorld.gameplayRandom;
    const wasLocked = random ? random.isLocked() : false;

    if (random) {
      random.unlock();
    }

    try {
      activeWorld.update(deltaTime);
      activeWorld.getEventBus()?.flushDeferred();
    } finally {
      if (random && wasLocked) {
        // TODO(refactor): código duplicado detectado (bloque) con flappybird/FlappyBirdGame.ts:62-67. Considerar extraer a función compartida. Ref: d7216a61
        random.lock();
      }
    }
  }

  // TODO(refactor): código duplicado detectado (método) con flappybird/FlappyBirdGame.ts:61-66. Considerar extraer a función compartida. Ref: debee144
  protected override async onRegisterSystems(): Promise<void> {
    this.config = resolveAndApplyMutators(this.baseConfig, this._config.gameOptions);

    this.world.setResource("GameConfig", this.config);
    this.setupCommonArcadeResources();
    this.world.setResource("IsHeadless", this.isHeadless);
    this._config.gameOptions = { ...this._config.gameOptions, ...this.config };

    if (!this.isHeadless) {
      await this.onPreloadAssets();
    }

    if (!this.playerBulletPool) this.playerBulletPool = new PlayerBulletPool();
    if (!this.enemyBulletPool) this.enemyBulletPool = new EnemyBulletPool();
    if (!this.particlePool) this.particlePool = new ParticlePool();

    // Register blueprints
    this.blueprints.register("player", {
      spawn: (world, entity, args: { x: number, y: number }) => {
        const config = world.getResource<SpaceInvadersConfig>("GameConfig") || GAME_CONFIG;
        const tint = resolveThemeColor(world, "player");

        const hasComboHeadStart = world.getResource("HasComboHeadStart") === true;
        const initialCombo = hasComboHeadStart ? 5 : 0;
        const initialMultiplier = hasComboHeadStart ? 2 : 1;
        const initialTimerRemaining = hasComboHeadStart ? config.COMBO_TIMEOUT / 1000 : 0;

        EntityBuilder.fromEntity(world, entity)
          .withTransform({ x: args.x, y: args.y })
          .withVelocity()
          .withRender({
            shape: "player_ship",
            size: config.PLAYER_RENDER_WIDTH,
            color: tint,
            order: 0
          })
          .withCollider({
            shape: { type: ShapeType.Circle, radius: config.PLAYER_COLLIDER_RADIUS } as CircleShape,
            layer: CollisionLayers.PLAYER,
            mask: CollisionLayers.ENEMY | CollisionLayers.DEBRIS
          })
          .withCollisionEvents();

        world.addComponent(entity, {
          type: "Health",
          current: config.PLAYER_INITIAL_LIVES,
          max: config.PLAYER_INITIAL_LIVES,
          invulnerableRemaining: 0
        } as HealthComponent);
        world.addComponent(entity, {
          type: "Faction",
          faction: "player",
          value: "player"
        } as FactionComponent);
        world.addComponent(entity, {
          type: "Boundary",
          width: config.SCREEN_WIDTH - config.PLAYER_RENDER_WIDTH,
          height: config.SCREEN_HEIGHT,
          mode: "bounce"
        } as BoundaryComponent);
        world.addComponent(entity, {
          type: "Input",
          moveLeft: false,
          moveRight: false,
          shoot: false,
          shootCooldownRemaining: 0,
        } as any);
        world.addComponent(entity, { type: "Player" } as any);
        world.addComponent(entity, {
          type: "Combo",
          combo: initialCombo,
          multiplier: initialMultiplier,
          timerRemaining: initialTimerRemaining,
          timerDuration: config.COMBO_TIMEOUT / 1000
        } as SpaceInvadersComponentRegistry["Combo"]);

        createEmitter(world as any, {
          type: "spawn",
          x: args.x,
          y: args.y,
          rate: 0,
          burst: true,
          count: 4,
          lifetime: [1.0, 1.5],
          speed: [30, 60],
          angle: [260, 280],
          size: [2, 4],
          color: ["#00FF00"],
          loop: false
        });
      }
    });

    this.blueprints.register("invader", {
      spawn: (world, entity, args: { x: number, y: number, row: number, col: number }) => {
        const blueprintId = args.row === 0 ? "invader_commander" : "invader_scout";
        EnemyFactory.createEnemy(world, blueprintId, args.x, args.y, {}, false, entity);
        const points = (5 - args.row) * 10;

        world.addComponent(entity, { type: "Invader", row: args.row, col: args.col, points } as any);
        world.addComponent(entity, {
          type: "LootTable",
          tableId: "invader",
          drops: [
            { type: "speed", chance: 0.05, config: { value: 1.5, duration: 5000 } },
            { type: "triple_shot", chance: 0.05, config: { duration: 8000 } }
          ]
        } as any);

        // Attach Collectible component directly
        world.addComponent(entity, {
          type: "Collectible",
          kind: "story_fragment",
          value: 1,
          persistent: true,
          collectOnce: true,
          id: `invader_fragment_${args.row}_${args.col}`
        } as any);
      }
    });

    // TODO(refactor): código duplicado detectado (bloque) con space-invaders/SpaceInvadersGame.ts:262-267. Considerar extraer a función compartida. Ref: 07d3787d
    this.blueprints.register("player_bullet", {
      spawn: (world, entity, args: { x: number, y: number }) => {
        const config = world.getResource<SpaceInvadersConfig>("GameConfig") || GAME_CONFIG;
        EntityBuilder.fromEntity(world, entity)
          .withTransform({ x: args.x, y: args.y })
          .withVelocity({ vy: -config.PLAYER_BULLET_SPEED })
          .withRender({ shape: "player_bullet", size: config.PLAYER_BULLET_SIZE, color: "yellow", order: 10 })
          .withCollider({
            shape: { type: ShapeType.Circle, radius: config.PLAYER_BULLET_SIZE } as CircleShape,
            layer: CollisionLayers.PROJECTILE,
            mask: CollisionLayers.ENEMY | CollisionLayers.DEBRIS
          })
          .withCollisionEvents();

        world.addComponent(entity, { type: "PlayerBullet" } as any);
        world.addComponent(entity, {
          type: "Damage",
          amount: 1,
          category: "player_bullet",
          friendlyFire: false,
          consumption: "destroy-entity"
        } as DamageComponent);
        world.addComponent(entity, { type: "Faction", faction: "player", value: "player" } as FactionComponent);
        world.addComponent(entity, {
          type: "Boundary",
          width: config.SCREEN_WIDTH,
          height: config.SCREEN_HEIGHT,
          mode: "destroy"
        } as BoundaryComponent);
      }
    });

    // TODO(refactor): código duplicado detectado (bloque) con space-invaders/SpaceInvadersGame.ts:231-236. Considerar extraer a función compartida. Ref: 7bc9738f
    this.blueprints.register("enemy_bullet", {
      spawn: (world, entity, args: { x: number, y: number }) => {
        const config = world.getResource<SpaceInvadersConfig>("GameConfig") || GAME_CONFIG;
        EntityBuilder.fromEntity(world, entity)
          .withTransform({ x: args.x, y: args.y })
          .withVelocity({ vy: config.ENEMY_BULLET_SPEED })
          .withRender({ shape: "enemy_bullet", size: config.ENEMY_BULLET_SIZE, color: "red", order: 10 })
          .withCollider({
            shape: { type: ShapeType.Circle, radius: config.ENEMY_BULLET_SIZE } as CircleShape,
            layer: CollisionLayers.ENEMY,
            mask: CollisionLayers.PLAYER | CollisionLayers.DEBRIS
          })
          .withCollisionEvents();

        world.addComponent(entity, { type: "EnemyBullet" } as any);
        world.addComponent(entity, {
          type: "Damage",
          amount: 1,
          category: "enemy_bullet",
          friendlyFire: false,
          consumption: "destroy-entity"
        } as DamageComponent);
        world.addComponent(entity, { type: "Faction", faction: "enemy", value: "enemy" } as FactionComponent);
        world.addComponent(entity, {
          type: "Boundary",
          width: config.SCREEN_WIDTH,
          height: config.SCREEN_HEIGHT,
          mode: "destroy"
        } as BoundaryComponent);
      }
    });

    this.blueprints.register("shield", {
      spawn: (world, entity, args: { x: number, y: number, row: number, col: number }) => {
        const config = world.getResource<SpaceInvadersConfig>("GameConfig") || GAME_CONFIG;
        const tint = resolveThemeColor(world, "shield", "secondary");

        EntityBuilder.fromEntity(world, entity)
          .withTransform({ x: args.x, y: args.y })
          .withRender({ shape: "shield_block", size: 15, color: tint, order: 0 })
          .withCollider({
            shape: { type: ShapeType.Box, width: 15, height: 15 } as BoxShape,
            layer: CollisionLayers.DEBRIS,
            mask: CollisionLayers.ENEMY | CollisionLayers.PROJECTILE
          })
          .withCollisionEvents();

        world.addComponent(entity, {
          type: "Shield",
          hp: config.SHIELD_SEGMENT_HP,
          maxHp: config.SHIELD_SEGMENT_HP,
          segment: { row: args.row, col: args.col }
        } as SpaceInvadersComponentRegistry["Shield"]);
      }
    });

    this.blueprints.register("state", {
      spawn: (world, entity, _args: {}) => {
        const config = world.getResource<SpaceInvadersConfig>("GameConfig") || GAME_CONFIG;
        const hasComboHeadStart = world.getResource("HasComboHeadStart") === true;
        const initialCombo = hasComboHeadStart ? 5 : 0;
        const initialMultiplier = hasComboHeadStart ? 2 : 1;
        const initialTimerRemaining = hasComboHeadStart ? config.COMBO_TIMEOUT / 1000 : 0;
        const isHeadless = this.isHeadless;

        world.addComponent(entity, {
          type: "GameState",
          lives: config.PLAYER_INITIAL_LIVES,
          score: 0,
          level: 1,
          invadersRemaining: 0,
          isGameOver: false,
          screenShake: null,
          kamikazesActive: 0,
          readyRemaining: isHeadless ? 0.0 : 3.0,
          intermissionRemaining: 0,
          continueCountdownRemaining: 0,
          continuesRemaining: 3,
        } as any);
        world.addComponent(entity, {
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

    this.blueprints.register("boss", {
      spawn: (world, entity, args: { level: number }) => {
        const config = world.getResource<SpaceInvadersConfig>("GameConfig") || GAME_CONFIG;
        const hp = 50 + (args.level / 5) * 50;
        const tint = resolveThemeColor(world, "boss", "accent");

        EntityBuilder.fromEntity(world, entity)
          .withTransform({ x: config.SCREEN_WIDTH / 2, y: 100 })
          .withRender({ shape: "boss", size: 80, color: tint, order: 0 })
          .withCollider({
            shape: { type: ShapeType.Circle, radius: 40 } as CircleShape,
            layer: CollisionLayers.ENEMY,
            mask: CollisionLayers.PLAYER | CollisionLayers.PROJECTILE
          })
          .withCollisionEvents();

        world.addComponent(entity, { type: "Health", current: hp, max: hp } as HealthComponent);
        world.addComponent(entity, { type: "Faction", faction: "enemy", value: "enemy" } as FactionComponent);
        world.addComponent(entity, { type: "Boss", hp, maxHp: hp, timer: 0, phase: 1 } as BossComponent);
      }
    });

    this.blueprints.register("formation", {
      spawn: (world, entity, _args: {}) => {
        const config = world.getResource<SpaceInvadersConfig>("GameConfig") || GAME_CONFIG;
        world.addComponent(entity, {
          type: "Formation",
          direction: 1,
          stepDownPending: false,
          speed: config.INVADER_SPEED_BASE,
          descentStep: config.INVADER_DESCENT_STEP,
          leftBound: 0,
          rightBound: 0,
          fireCooldownRemaining: config.ENEMY_FIRE_INTERVAL_MIN,
        } as any);
      }
    });

    // Bind inputs for UnifiedInputSystem
    this.unifiedInput.bind("moveLeft", [this.config.KEYS.LEFT]);
    this.unifiedInput.bind("moveRight", [this.config.KEYS.RIGHT]);
    this.unifiedInput.bind("shoot", [this.config.KEYS.SHOOT]);

    const gameScene = new SpaceInvadersGameScene(
      this,
      this.playerBulletPool,
      this.enemyBulletPool,
      this.particlePool,
      this.config,
      this.world
    );

    const powerUpRegistry = new PowerUpEffectRegistry();
    powerUpRegistry.attachToWorld(this.world);

    // Register Power-up systems in the unified world
    this.world.addSystem(new LootSystem());
    this.world.addSystem(new PowerUpSystem());
    this.world.addSystem(new ComboSystem());

    if (!this.networkManager) {
      this.networkManager = NetworkManager.registerGame(this.gameId, this, {
          strategy: 'hybrid',
          interpolationDelay: 100
      });
    }
    this.world.addSystem(new LocalPredictionSystem(this.networkManager, () => {}), { phase: SystemPhase.Input });
    this.world.addSystem(new RemoteInterpolationSystem(this.networkManager), { phase: SystemPhase.Presentation });

    this.sceneManager.transitionTo(gameScene, { effect: "crt", duration: 300 });
  }

  protected override async onBeforeRestart(): Promise<void> {
    this.sceneManager?.destroy();
  }

  private _recorder: ReplayRecorder | null = null;
  private _player: ReplayPlayer | null = null;

  public startRecordingReplay(): void {
    this._recorder = new ReplayRecorder(this.getSeed());
  }

  public stopRecordingReplay(): string | null {
    if (this._recorder) {
      const serialized = this._recorder.serialize({ gameId: "space-invaders" });
      this._recorder = null;
      return serialized;
    }
    return null;
  }

  public startPlaybackReplay(serialized: string): void {
    this._player = new ReplayPlayer(serialized);
    const seed = this._player.getSeed();
    this.getWorld().gameplayRandom.setSeed(seed);
  }

  public stopPlaybackReplay(): void {
    this._player = null;
  }

  public override update(dt: number): void {
      const world = this.getWorld();

      // 1. Playback recorded inputs if a replay is running
      if (this._player) {
        world.setResource("IsReplayPlayback", true);
        const playerEntity = world.query("Player")[0];
        if (playerEntity !== undefined) {
          const tick = world.tick + 1; // Upcoming tick
          const frame = (this._player as any).inputs.find((i: any) => i.tick === tick);
          if (frame) {
            if (!world.hasComponent(playerEntity, "Input")) {
              world.addComponent(playerEntity, {
                type: "Input",
                moveLeft: false,
                moveRight: false,
                shoot: false,
                shootCooldownRemaining: 0
              } as any);
            }
            world.mutateComponent(playerEntity, "Input", (inputComp: any) => {
              inputComp.moveLeft = frame.actions.includes("moveLeft");
              inputComp.moveRight = frame.actions.includes("moveRight");
              inputComp.shoot = frame.actions.includes("shoot");
            });
          }
        }
      } else {
        world.deleteResource("IsReplayPlayback");
      }

      // 2. Perform the actual simulation update tick
      if (this.sceneManager) {
        this.sceneManager.update(dt);
      } else {
        world.update(dt);
      }
      world.getEventBus()?.flushDeferred();

      // 3. Record inputs if recording is enabled
      if (this._recorder) {
        const playerEntity = world.query("Player")[0];
        const inputComp = playerEntity !== undefined ? world.getComponent(playerEntity, "Input") as any : null;
        const actions: string[] = [];
        if (inputComp) {
          if (inputComp.moveLeft) actions.push("moveLeft");
          if (inputComp.moveRight) actions.push("moveRight");
          if (inputComp.shoot) actions.push("shoot");
        }
        this._recorder.recordFrame({
          tick: world.tick,
          actions,
          axes: {}
        });
      }
  }

  private async onPreloadAssets(): Promise<void> {
    const assets = [
      { id: "shoot", path: "/audio/shoot.mp3" },
      { id: "explosion", path: "/audio/explosion.mp3" },
      { id: "hit", path: "/audio/hit.mp3" },
      { id: "game_over", path: "/audio/game_over.mp3" },
    ];
    await loadAudioAssets(this.audio, assets);
  }

  public initializeRenderer(renderer: Renderer<any, any>): void {
    RendererUtils.registerAssets(renderer, {
      canvas: (r) => {
        const {
          drawSpaceInvadersPlayer,
          drawSpaceInvadersInvader,
          drawSpaceInvadersBoss,
          drawSpaceInvadersBullet,
          drawSpaceInvadersShield,
          drawSpaceInvadersParticle
        } = require("./rendering/SpaceInvadersCanvasVisuals");
        r.registerShape("player_ship", drawSpaceInvadersPlayer);
        r.registerShape("invader", drawSpaceInvadersInvader);
        r.registerShape("boss", drawSpaceInvadersBoss);
        r.registerShape("player_bullet", drawSpaceInvadersBullet);
        r.registerShape("enemy_bullet", drawSpaceInvadersBullet); // Reuse bullet drawer
        r.registerShape("shield_block", drawSpaceInvadersShield);
        r.registerShape("particle", drawSpaceInvadersParticle);
      },
      skia: (r) => {
        const {
          drawSkiaSpaceInvadersPlayer,
          drawSkiaSpaceInvadersInvader,
          drawSkiaSpaceInvadersBoss,
          drawSkiaSpaceInvadersBullet,
          drawSkiaSpaceInvadersShield,
          drawSkiaSpaceInvadersParticle
        } = require("./rendering/SpaceInvadersSkiaVisuals");
        r.registerShape("player_ship", drawSkiaSpaceInvadersPlayer);
        r.registerShape("invader", drawSkiaSpaceInvadersInvader);
        r.registerShape("boss", drawSkiaSpaceInvadersBoss);
        r.registerShape("player_bullet", drawSkiaSpaceInvadersBullet);
        r.registerShape("enemy_bullet", drawSkiaSpaceInvadersBullet);
        r.registerShape("shield_block", drawSkiaSpaceInvadersShield);
        r.registerShape("particle", drawSkiaSpaceInvadersParticle);
      }
    });

    SharedVFX.registerSharedVFX(renderer);
  }

  public selectRunMutator(mutatorId: string): void {
    const world = this.getWorld();
    const playerEntity = world.query("Player")[0];
    if (playerEntity === undefined) return;

    const draft = world.getComponent(playerEntity, "DraftState" as any) as any;
    if (!draft) {
      // For backward compatibility with the old test suite and old RunMutatorChoices trigger
      const choices = world.getResource<{ choices: string[], active: boolean }>("RunMutatorChoices");
      if (choices && choices.active) {
        if (BENEFICIAL_MUTATORS[mutatorId]) {
          BENEFICIAL_MUTATORS[mutatorId].apply(world, { playerId: `player_${playerEntity}`, targetEntity: playerEntity });
        } else if (NEGATIVE_MUTATORS[mutatorId]) {
          NEGATIVE_MUTATORS[mutatorId].apply(world, { playerId: `player_${playerEntity}`, targetEntity: playerEntity });
        }

        const activeRun = world.getResource<string[]>("ActiveRunMutators") || [];
        activeRun.push(mutatorId);
        world.setResource("ActiveRunMutators", activeRun);

        choices.active = false;
        world.setResource("RunMutatorChoices", choices);

        this.resume();
      }
      return;
    }

    // Validation: make sure the server/game validates against options actually offered to that player!
    if (!draft.options.includes(mutatorId)) {
      console.warn(`Jugador player_${playerEntity} seleccionó un mutador no ofrecido: ${mutatorId}`);
      return;
    }

    // Apply the mutator with targetEntity context
    const mutator = MutatorRegistry.get(mutatorId);
    mutator.apply(world, { playerId: `player_${playerEntity}`, targetEntity: playerEntity });

    // Mark as chosen and store selected ID
    world.mutateComponent(playerEntity, "DraftState" as any, (ds: any) => {
      ds.options = [];
      ds.hasChosen = true;
      ds.selectedMutatorId = mutatorId;
    });

    // Record in active mutators list
    const activeRun = world.getResource<string[]>("ActiveRunMutators") || [];
    if (!activeRun.includes(mutatorId)) {
      activeRun.push(mutatorId);
    }
    world.setResource("ActiveRunMutators", activeRun);

    // Resume phase ONLY when ALL active players have made their choice!
    const allPlayers = world.query("Player");
    const allPlayersReady = allPlayers.length > 0 && allPlayers.every(p => {
      const d = world.getComponent(p, "DraftState" as any) as any;
      return d && d.hasChosen;
    });

    if (allPlayersReady) {
      world.mutateSingleton("GameState", (gs: any) => {
        gs.phase = "PLAYING";
        // Also clean DraftState components from players to prepare for next wave
        allPlayers.forEach(p => {
          world.removeComponent(p, "DraftState" as any);
        });
      });

      // Increment SpawnDirector's waveIndex to trigger next wave!
      const directorEntity = world.query("SpawnDirector" as any)[0];
      if (directorEntity !== undefined) {
        world.mutateComponent(directorEntity, "SpawnDirector" as any, (d: any) => {
          d.waveIndex++;
          d.status = "idle";
        });
      }
    }
  }

  public getGameState(): GameStateComponent {
    const world = this.getWorld();
    const state = world.getSingleton("GameState");
    if (!state) return INITIAL_GAME_STATE;

    let combo = 0;
    let multiplier = 1;
    let comboTimerRemaining = 0;

    const comboEntities = world.query("Combo");
    const comboEntity = comboEntities[0];
    if (comboEntity !== undefined) {
      const comboComp = world.getComponent(comboEntity, "Combo");
      if (comboComp) {
        combo = comboComp.combo;
        multiplier = comboComp.multiplier;
        comboTimerRemaining = Math.max(0, comboComp.timerRemaining);
      }
    }

    const runChoices = world.getResource<{ choices: string[], active: boolean }>("RunMutatorChoices");
    const activeRun = world.getResource<string[]>("ActiveRunMutators") || [];

    const playerEntity = world.query("Player")[0];
    const draft = playerEntity !== undefined ? world.getComponent(playerEntity, "DraftState" as any) as any : null;
    const choices = draft && !draft.hasChosen ? draft.options : (runChoices?.active ? runChoices.choices : null);

    let isDialogueActive = false;
    let dialogueText = "";
    const dialogueBoxEntities = world.query("DialogueBox");
    if (dialogueBoxEntities.length > 0) {
      // TODO(refactor): código duplicado detectado (bloque) con asteroids/AsteroidsGame.ts:408-420. Considerar extraer a función compartida. Ref: 4fe85665
      const dialogueBox = world.getComponent(dialogueBoxEntities[0], "DialogueBox");
      if (dialogueBox) {
        isDialogueActive = true;
        const currentLineKey = dialogueBox.lines[dialogueBox.currentLineIndex];
        dialogueText = currentLineKey || "";
      }
    }

    return {
      ...state,
      combo,
      multiplier,
      comboTimerRemaining,
      runMutatorChoices: choices,
      activeRunMutators: activeRun,
      isDialogueActive,
      dialogueText
    };
  }

  public getWorld(): World<SpaceInvadersComponentRegistry> {
    return this.world;
  }

  public setMultiplayerMode(active: boolean) {
    this.isMultiplayer = active;
  }

  public override setInputState(input: any): void {
    const world = this.getWorld();
    const playerEntity = world.query("Player")[0];
    if (playerEntity !== undefined) {
      if (!world.hasComponent(playerEntity, "Input")) {
        world.addComponent(playerEntity, {
          type: "Input",
          moveLeft: false,
          moveRight: false,
          shoot: false,
          shootCooldownRemaining: 0,
        } as any);
      }
      world.mutateComponent(playerEntity, "Input", (inputComp: any) => {
        // CanonicalInputState support
        if (input && typeof input === "object" && input.axes) {
          const moveX = input.axes.moveX ?? 0;
          inputComp.moveLeft = moveX < 0;
          inputComp.moveRight = moveX > 0;
          inputComp.shoot = input.actions instanceof Set ? input.actions.has("fire") : !!input.actions?.includes?.("fire");
        } else {
          if (input.moveLeft !== undefined) inputComp.moveLeft = input.moveLeft;
          if (input.moveRight !== undefined) inputComp.moveRight = input.moveRight;
          if (input.shoot !== undefined) inputComp.shoot = input.shoot;
        }
      });
    }
  }

  public setInput(input: Partial<InputState>) {
    this.setInputState(input);
  }

  public updateFromServer(state: Record<string, unknown>, localSessionId?: string) {
    if (!this.isMultiplayer || !state) return;
    const world = this.getWorld();

    // Synchronize global GameState singleton on the client from server state
    const gs = world.getSingleton("GameState");
    if (gs) {
      world.mutateSingleton("GameState", (currentGs) => {
        if (state.score !== undefined) {
          currentGs.score = Number(state.score);
        }
        if (state.gameOver !== undefined) {
          currentGs.isGameOver = !!state.gameOver;
        }
      });
    }

    const replicator = this.networkManager.getReplicator();
    const commands = world.getCommandBuffer();

    const currentServerEntities = new Set<string>();

    // Sync with NetworkManager for interpolation
    // TODO(refactor): código duplicado detectado (bloque) con flappybird/FlappyBirdGame.ts:411-422. Considerar extraer a función compartida. Ref: 6b235ffa
    const snapshot: WorldSnapshot = {
        tick: (state.tick as number) || 0,
        entities: [],
        componentData: { Transform: {} },
        stateVersion: 0,
        structureVersion: 0,
        seed: 0,
        nextEntityId: 0,
        freeEntities: []
    };

    // Update Players
    if (state.players && typeof state.players === 'object') {
      // TODO(refactor): código duplicado detectado (bloque) con flappybird/FlappyBirdGame.ts:366-372. Considerar extraer a función compartida. Ref: 7a271799
      const players = state.players as Record<string, { x: number, y: number, alive: boolean, sessionId?: string }>;
      Object.entries(players).forEach(([sessionId, playerState]) => {
        const serverId = `player_${sessionId}`;
        currentServerEntities.add(serverId);

        const entity = replicator.resolveEntity(serverId, world);
        if (!world.hasComponent(entity, "Transform")) {
          this.blueprints.get("player")?.spawn(world, entity, { x: playerState.x, y: playerState.y });
        }

        if (sessionId === localSessionId && !world.hasComponent(entity, "LocalPlayer" as any)) {
          commands.addComponent(entity, { type: "LocalPlayer" } as any);
          if (!world.hasComponent(entity, "Input" as any)) {
            commands.addComponent(entity, {
              type: "Input",
              moveLeft: false,
              moveRight: false,
              shoot: false,
              shootCooldownRemaining: 0,
            } as any);
          }
        }

        snapshot.entities.push(entity);
        snapshot.componentData["Transform"][entity] = { type: "Transform", x: playerState.x, y: playerState.y, rotation: 0, scaleX: 1, scaleY: 1, worldX: playerState.x, worldY: playerState.y, worldRotation: 0, worldScaleX: 1, worldScaleY: 1, dirty: false };

        world.mutateComponent(entity, "Render", render => {
          render.color = playerState.alive ? "green" : "red";
        });
      });
    }

    // Update Invaders
    if (state.invaders && typeof state.invaders === 'object') {
      const invaders = state.invaders as Record<string, { x: number, y: number, alive: boolean, id: string }>;
      Object.entries(invaders).forEach(([id, invaderState]) => {
        if (!invaderState.alive) return;
        const serverId = `invader_${id}`;
        currentServerEntities.add(serverId);

        const entity = replicator.resolveEntity(serverId, world);
        if (!world.hasComponent(entity, "Transform")) {
          this.blueprints.get("invader")?.spawn(world, entity, { x: invaderState.x, y: invaderState.y, row: 0, col: 0 });
        }

        snapshot.entities.push(entity);
        snapshot.componentData["Transform"][entity] = { type: "Transform", x: invaderState.x, y: invaderState.y, rotation: 0, scaleX: 1, scaleY: 1, worldX: invaderState.x, worldY: invaderState.y, worldRotation: 0, worldScaleX: 1, worldScaleY: 1, dirty: false };
      });
    }

    // Update Bullets
    if (state.bullets && typeof state.bullets === 'object') {
      // TODO(refactor): código duplicado detectado (bloque) con geometrywars/GeometryWarsGame.ts:222-228. Considerar extraer a función compartida. Ref: 31cad89a
      const bullets = state.bullets as Record<string, { x: number, y: number, ownerId: string }>;
      Object.entries(bullets).forEach(([id, bulletState]) => {
        const serverId = `bullet_${id}`;
        currentServerEntities.add(serverId);

        const entity = replicator.resolveEntity(serverId, world);
        if (!world.hasComponent(entity, "Transform")) {
          const bpName = bulletState.ownerId === "player" ? "player_bullet" : "enemy_bullet";
          this.blueprints.get(bpName)?.spawn(world, entity, { x: bulletState.x, y: bulletState.y });
        }

        snapshot.entities.push(entity);
        snapshot.componentData["Transform"][entity] = { type: "Transform", x: bulletState.x, y: bulletState.y, rotation: 0, scaleX: 1, scaleY: 1, worldX: bulletState.x, worldY: bulletState.y, worldRotation: 0, worldScaleX: 1, worldScaleY: 1, dirty: false };
      });
    }

    // TODO(refactor): código duplicado detectado (bloque) con flappybird/FlappyBirdGame.ts:441-456. Considerar extraer a función compartida. Ref: a1d6c8d1
    this.networkManager.processServerUpdate(snapshot.tick, snapshot, localSessionId);

    // Cleanup removed entities
    replicator.getMappings().forEach((entity: number, serverId: string) => {
      if (!currentServerEntities.has(serverId)) {
        commands.removeEntity(entity);
        replicator.removeMapping(serverId);
      }
    });

    // Deferred CommandBuffer Flush Lifecycle:
    // When updateFromServer is executed out-of-band (e.g., upon receiving a server network snapshot message
    // between game loop frames), world.isUpdating is false.
    // Structural changes like entity removal or deferred blueprint additions queue commands into WorldCommandBuffer.
    // Flushing when !world.isUpdating immediately materializes queued entity/component state, preventing
    // transient "ghost entities" or unapplied network components prior to system queries or rendering.
    // If updateFromServer is called during active frame execution (world.isUpdating === true), flush is deferred
    // to the end of world.update() tick to avoid structural mutation during system query iteration.
    if (!world.isUpdating) {
      world.flush();
    }
  }

  public isGameOver(): boolean {
    return this.getGameState().isGameOver;
  }

  public override start(): void {
    super.start();
    if (__DEV__) console.log("[SpaceInvadersGame] Simulation started");
  }

  public stop(): void {
    if (__DEV__) console.log("[SpaceInvadersGame] Simulation stopped");
  }

  public override pause(): void {
    super.pause();
    this.getWorld().setResource("IsPaused", true);
    if (__DEV__) console.log("[SpaceInvadersGame] Simulation paused");
  }

  public override resume(): void {
    super.resume();
    this.getWorld().setResource("IsPaused", false);
    if (__DEV__) console.log("[SpaceInvadersGame] Simulation resumed");
  }
}

export class NullSpaceInvadersGame extends NullBaseGame<GameStateComponent, InputState, SpaceInvadersComponentRegistry> implements ISpaceInvadersGame {
  public isMultiplayer = false;
  public gameId = "space-invaders";

  public override getGameState(): GameStateComponent {
    return INITIAL_GAME_STATE;
  }

  public setInput(input: Partial<InputState>): void {
    this.setInputState(input);
  }

  public selectRunMutator(_mutatorId: string): void {}
  public startRecordingReplay(): void {}
  public stopRecordingReplay(): string | null { return null; }
  public startPlaybackReplay(_serialized: string): void {}
  public stopPlaybackReplay(): void {}
}

export const SpaceInvadersDefinition = {
  name: "space-invaders",
  createSimulation: (seed: number) => {
    const game = new SpaceInvadersGame({ gameOptions: { seed } });
    return game;
  },
  inputSchema: {
    actions: ["moveLeft", "moveRight", "shoot"]
  },
  assets: {
    sprites: [],
    sounds: [
      { id: "shoot", path: "/audio/shoot.mp3" },
      { id: "hit", path: "/audio/hit.mp3" },
      { id: "explosion", path: "/audio/explosion.mp3" },
      { id: "game_over", path: "/audio/game_over.mp3" }
    ]
  }
};

registerMutatorHook("story_fragment", (world: World) => {
  const eventBus = world.getEventBus();
  if (eventBus) {
    eventBus.emit("story:beat_reached", { beatId: "space_invaders_story_beat", dialogueReference: "story.chapter_1_fragment_3" });
  }
});
