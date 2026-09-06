import { EntityBlueprint, InvaderBlueprint, AsteroidBlueprint, ProjectileBlueprint, AsteroidSize } from '../types/BlueprintTypes';
import { CollisionLayers } from "@tiny-aster/gameplay-kit";

interface InvaderBlueprintConfig {
  id: string;
  displayName: string;
  color: string;
  points: number;
  archetype: 'basic' | 'elite' | 'scout';
  fireRate: number;
  health?: number;
  maxSpeed?: number;
  tags?: readonly string[];
}

function createInvaderBlueprint(config: InvaderBlueprintConfig): InvaderBlueprint {
  return {
    id: config.id,
    kind: 'invader',
    displayName: config.displayName,
    render: { shape: 'invader', size: 24, color: config.color, zIndex: 15 },
    physics: { maxSpeed: config.maxSpeed ?? 85 },
    collision: {
      radius: 12,
      layer: CollisionLayers.ENEMY,
      mask: CollisionLayers.PLAYER | CollisionLayers.PROJECTILE | CollisionLayers.DEBRIS,
      isTrigger: false
    },
    stats: { health: config.health ?? 1, points: config.points },
    tags: config.tags ?? ['enemy', 'invader', 'Invader'],
    invader: { archetype: config.archetype, fireRate: config.fireRate }
  };
}

interface AsteroidBlueprintConfig {
  id: string;
  displayName: string;
  size: AsteroidSize;
  radius: number;
  color: string;
  maxSpeed: number;
  points: number;
  splitsInto: readonly string[];
  splitCount: number;
}

function createAsteroidBlueprint(config: AsteroidBlueprintConfig): AsteroidBlueprint {
  return {
    id: config.id,
    kind: 'asteroid',
    displayName: config.displayName,
    render: { shape: 'polygon', size: config.radius, color: config.color, zIndex: 10 },
    physics: { maxSpeed: config.maxSpeed, boundaryBehavior: "wrap" },
    collision: {
      radius: config.radius,
      layer: CollisionLayers.ENEMY,
      mask: CollisionLayers.PLAYER | CollisionLayers.PROJECTILE,
      isTrigger: false
    },
    stats: { health: 1, points: config.points },
    tags: ['asteroid', 'Asteroid'],
    asteroid: { size: config.size, splitsInto: config.splitsInto, splitCount: config.splitCount }
  };
}

interface ProjectileBlueprintConfig {
  id: string;
  displayName: string;
  color: string;
  maxSpeed: number;
  ttl: number;
  mask: number;
  tags: readonly string[];
  ownerType: 'player' | 'enemy';
}

function createProjectileBlueprint(config: ProjectileBlueprintConfig): ProjectileBlueprint {
  return {
    id: config.id,
    kind: 'projectile',
    displayName: config.displayName,
    render: { shape: 'circle', size: 2, color: config.color, zIndex: 25 },
    physics: { maxSpeed: config.maxSpeed, ttl: config.ttl },
    collision: {
      radius: 2,
      layer: CollisionLayers.PROJECTILE,
      mask: config.mask,
      isTrigger: true
    },
    stats: { health: 1, points: 0 },
    tags: config.tags,
    projectile: { ownerType: config.ownerType, damage: 1 }
  };
}

export const EnemyBlueprints: Record<string, EntityBlueprint> = {
  // --- Asteroids ---
  large_asteroid: createAsteroidBlueprint({
    id: 'large_asteroid',
    displayName: 'Large Asteroid',
    size: 'large',
    radius: 30,
    color: '#555555',
    maxSpeed: 100,
    points: 20,
    splitsInto: ['medium_asteroid'],
    splitCount: 2
  }),

  medium_asteroid: createAsteroidBlueprint({
    id: 'medium_asteroid',
    displayName: 'Medium Asteroid',
    size: 'medium',
    radius: 20,
    color: '#8B4513',
    maxSpeed: 150,
    points: 50,
    splitsInto: ['small_asteroid'],
    splitCount: 2
  }),

  small_asteroid: createAsteroidBlueprint({
    id: 'small_asteroid',
    displayName: 'Small Asteroid',
    size: 'small',
    radius: 10,
    color: '#AAAAAA',
    maxSpeed: 200,
    points: 100,
    splitsInto: [],
    splitCount: 0
  }),

  // --- Invaders ---
  invader_commander: createInvaderBlueprint({
    id: 'invader_commander',
    displayName: 'Invader Commander',
    color: '#FF00FF',
    points: 30,
    archetype: 'basic',
    fireRate: 0.8
  }),

  invader_scout: createInvaderBlueprint({
    id: 'invader_scout',
    displayName: 'Invader Scout',
    color: '#FFFFFF',
    points: 10,
    archetype: 'basic',
    fireRate: 0.8
  }),

  elite_invader: createInvaderBlueprint({
    id: 'elite_invader',
    displayName: 'Elite Invader',
    color: '#00FFFF',
    points: 50,
    archetype: 'elite',
    fireRate: 1.4,
    health: 3,
    maxSpeed: 110,
    tags: ['enemy', 'invader', 'Invader', 'Elite']
  }),

  // --- UFOs ---
  ufo_scout: {
    id: 'ufo_scout',
    kind: 'ufo',
    displayName: 'UFO Scout',
    render: { shape: 'ufo', size: 15, color: '#00FF00', zIndex: 20 },
    physics: { maxSpeed: 120, boundaryBehavior: "wrap" },
    collision: { radius: 15, layer: CollisionLayers.ENEMY, mask: CollisionLayers.PLAYER | CollisionLayers.PROJECTILE, isTrigger: false },
    stats: { health: 1, points: 200 },
    tags: ['enemy', 'ufo', 'Ufo'],
    ufo: { behavior: 'zigzag', scoreBonus: 100 }
  },

  // --- Projectiles ---
  player_bullet: createProjectileBlueprint({
    id: 'player_bullet',
    displayName: 'Player Bullet',
    color: '#FFFFFF',
    maxSpeed: 300,
    ttl: 2000,
    mask: CollisionLayers.ENEMY,
    tags: ['bullet', 'player_projectile'],
    ownerType: 'player'
  }),

  enemy_bullet: createProjectileBlueprint({
    id: 'enemy_bullet',
    displayName: 'Enemy Bullet',
    color: '#FF0000',
    maxSpeed: 200,
    ttl: 3000,
    mask: CollisionLayers.PLAYER,
    tags: ['bullet', 'enemy_projectile'],
    ownerType: 'enemy'
  })
} as const;
