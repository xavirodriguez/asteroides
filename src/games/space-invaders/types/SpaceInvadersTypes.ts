import { Component, CoreComponentRegistry, CoreEvents } from "@tiny-aster/core";

/**
 * Event registry mapping for Space Invaders.
 * @public
 */
export interface SpaceInvadersEventRegistry extends CoreEvents, Record<string, unknown> {
  "si:boss_defeated": Record<string, unknown>;
  "stage:cleared": { level: number };
  "si:kill": { chain: number };
  "entity:destroyed": { entity: number; type: string };
}
import { ComboComponent } from "@tiny-aster/core";
import { LootTableComponent, PowerUpComponent } from "@tiny-aster/gameplay-kit";
import { DamageComponent, FactionComponent } from "@tiny-aster/gameplay-kit";
import { SpawnDirectorComponent, WaveMemberComponent } from "@tiny-aster/gameplay-kit";
import { DialogueBoxComponent } from "../../shared/story/DialogueBoxComponent";

/**
 * Component for Boss entities.
 */
export interface BossComponent extends Component {
  type: "Boss";
  hp: number;
  maxHp: number;
  timer: number;
  phase: number;
  fury?: number;
  furyDuration?: number;
  counterFirePending?: boolean;
}

/**
 * Component for Kamikaze entities.
 */
export interface KamikazeComponent extends Component {
  type: "Kamikaze";
  phase: "diving" | "returning";
  originX: number;
  originY: number;
  diveSpeed: number;
}

/**
 * Component for UI Text rendering.
 */
export interface UITextComponent extends Component {
  type: "UIText";
  content: string;
  wordWrap: boolean;
  maxLines: number;
}

/**
 * Component registry mapping for Space Invaders.
 */
export interface SpaceInvadersComponentRegistry extends CoreComponentRegistry {
  Input: InputComponent;
  Player: PlayerComponent;
  Invader: InvaderComponent;
  EnemyBullet: EnemyBulletComponent;
  PlayerBullet: PlayerBulletComponent;
  Shield: ShieldComponent;
  Formation: FormationComponent;
  GameState: GameStateComponent;
  Boss: BossComponent;
  Kamikaze: KamikazeComponent;
  UIText: UITextComponent;
  Combo: ComboComponent;
  Damage: DamageComponent;
  Faction: FactionComponent;
  SpawnDirector: SpawnDirectorComponent;
  WaveMember: WaveMemberComponent;
  LootTable: LootTableComponent;
  PowerUp: PowerUpComponent;
  DialogueBox: DialogueBoxComponent;
}

/**
 * Represents the current state of user inputs for Space Invaders.
 */
export interface InputState {
  moveLeft: boolean;
  moveRight: boolean;
  shoot: boolean;
  [key: string]: unknown;
}

/**
 * Stores the current input state for the player in Space Invaders.
 */
export interface InputComponent extends Component, InputState {
  type: "Input";
  shootCooldownRemaining: number;
}

/**
 * Marker component for the player.
 */
export interface PlayerComponent extends Component {
  type: "Player";
}

/**
 * Component for invaders.
 */
export interface InvaderComponent extends Component {
  type: "Invader";
  row: number;
  col: number;
  points: number;
}

/**
 * Marker component for enemy bullets.
 */
export interface EnemyBulletComponent extends Component {
  type: "EnemyBullet";
}

/**
 * Marker component for player bullets.
 */
export interface PlayerBulletComponent extends Component {
  type: "PlayerBullet";
}

/**
 * Component for shield segments.
 */
export interface ShieldComponent extends Component {
  type: "Shield";
  hp: number;
  maxHp: number;
  segment?: { row: number; col: number };
}

/**
 * Singleton entity to control the invader formation.
 */
export interface FormationComponent extends Component {
  type: "Formation";
  direction: 1 | -1;
  stepDownPending: boolean;
  speed: number;
  descentStep: number;
  leftBound: number;
  rightBound: number;
  fireCooldownRemaining: number;
  totalInvaders: number;
}

/**
 * Component to track global game progress and state.
 */
export interface GameStateComponent extends Component {
  type: "GameState";
  lives: number;
  score: number;
  level: number;
  invadersRemaining: number;
  isGameOver: boolean;
  highScoreCandidate?: number;
  screenShake?: { intensity: number; duration: number; elapsed?: number; totalDuration?: number } | null;
  kamikazesActive: number;
  gameOverLogged?: boolean;
  readyRemaining: number;
  intermissionRemaining: number;
  continueCountdownRemaining: number;
  continuesRemaining: number;
  /** Populated dynamically in getGameState() for backward compatibility. */
  combo?: number;
  /** Populated dynamically in getGameState() for backward compatibility. */
  multiplier?: number;
  /** Populated dynamically in getGameState() for backward compatibility. */
  comboTimerRemaining?: number;
  /** Roguelite run mutator choices currently pending selection. */
  runMutatorChoices?: string[] | null;
  /** Roguelite active run mutator ids currently active in this run. */
  activeRunMutators?: string[];
  isDialogueActive?: boolean;
  dialogueText?: string;
}

/**
 * Null Object for GameStateComponent.
 */
export const INITIAL_GAME_STATE: GameStateComponent = Object.freeze({
  type: "GameState",
  lives: 0,
  score: 0,
  level: 0,
  invadersRemaining: 0,
  isGameOver: false,
  kamikazesActive: 0,
  readyRemaining: 0,
  intermissionRemaining: 0,
  continueCountdownRemaining: 0,
  continuesRemaining: 3,
});

import { DEFAULT_SPACE_INVADERS_CONFIG } from "./SpaceInvadersConfigSchema";

/**
 * Global game configuration constants.
 */
export const GAME_CONFIG = DEFAULT_SPACE_INVADERS_CONFIG;
