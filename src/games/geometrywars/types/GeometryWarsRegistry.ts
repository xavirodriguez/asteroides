import { CoreComponentRegistry, CoreEvents, Component, BlueprintRegistryMap } from "@tiny-aster/core";
import { DamageComponent, FactionComponent } from "@tiny-aster/gameplay-kit";
import { SpawnDirectorComponent, WaveMemberComponent } from "@tiny-aster/gameplay-kit";
import { ComboComponent } from "@tiny-aster/core";

/**
 * State component containing overall score, lives, current wave, and game-over status.
 */
export interface GeometryWarsStateComponent extends Component {
  type: "GeometryWarsState";
  score: number;
  lives: number;
  bombs: number;
  wave: number;
  isGameOver: boolean;
  gameTime: number;
}

/**
 * AimComponent represents the current twin-stick pointing vector and firing trigger.
 */
export interface AimComponent extends Component {
  type: "Aim";
  aimX: number;
  aimY: number;
  isFiring: boolean;
}

/**
 * Player component tracking ship-specific state.
 */
export interface PlayerComponent extends Component {
  type: "Player";
  fireCooldownRemaining: number;
  invulnRemaining: number;
  moveX: number;
  moveY: number;
  useBomb?: boolean;
}

/**
 * WeaponComponent tracks weapon cooldowns and settings.
 */
export interface WeaponComponent extends Component {
  type: "Weapon";
  cooldownRemaining: number;
  cooldownDuration: number;
}

import { KineticAccumulatorComponent as CoreKineticAccumulatorComponent } from "@tiny-aster/core";

/**
 * KineticAccumulatorComponent tracks energy accumulation, burst availability, and overdrive mode.
 */
export interface KineticAccumulatorComponent extends CoreKineticAccumulatorComponent {
  overdriveRemaining: number;
}

export interface GeometryWarsInput extends Record<string, any> {
  moveX: number;
  moveY: number;
  aimX: number;
  aimY: number;
  bomb: boolean;
}

/**
 * Registry containing all components used in Geometry Wars.
 * @public
 */
export interface GeometryWarsComponentRegistry extends CoreComponentRegistry {
  GeometryWarsState: GeometryWarsStateComponent;
  Aim: AimComponent;
  Player: PlayerComponent;
  Damage: DamageComponent;
  Faction: FactionComponent;
  Weapon: WeaponComponent;
  SpawnDirector: SpawnDirectorComponent;
  WaveMember: WaveMemberComponent;
  Combo: ComboComponent;
  KineticAccumulator: KineticAccumulatorComponent;
}

/**
 * Event Registry for Geometry Wars.
 * @public
 */
export interface GeometryWarsEventRegistry extends CoreEvents, Record<string, unknown> {
  "combat:hit": {
    targetEntity: number;
    sourceEntity: number;
    amount: number;
    remainingHealth: number;
    category?: string;
  };
  "combat:death": {
    entity: number;
    sourceEntity: number;
    category?: string;
  };
  "spawn:wave_complete": { wave?: number };
  "enemy:destroyed": { entity: number };
}

/**
 * Blueprints map for spawning standardized entity archetypes.
 * @public
 */
export type GeometryWarsBlueprintRegistry = BlueprintRegistryMap<
  GeometryWarsComponentRegistry,
  GeometryWarsEventRegistry
>;
