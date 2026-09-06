import { SharedParticlePool } from "@tiny-aster/gameplay-kit";

/**
 * Empty/Dummy pool for bullets if not actively pooled.
 * @public
 */
export class BulletPool {
  public clear(): void {}
}

/**
 * Standardized, zero-allocation Particle Pool for Asteroids.
 * Extends SharedParticlePool for cross-game consistency.
 * @public
 */
export class ParticlePool extends SharedParticlePool {
  constructor() {
    super({
      poolId: "ParticlePool",
      shape: "particle",
      order: 10,
      isTrigger: true
    });
  }
}
