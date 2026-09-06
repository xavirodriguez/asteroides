import { ShapeDrawer, EffectDrawer, World } from "@tiny-aster/core";
import { GameStateComponent, SpaceInvadersComponentRegistry } from "../types/SpaceInvadersTypes";
import { colors } from "../../../theme/colors";
import { applyHitFlash, isPlayerShooting, calculatePlayerTilt, calculateThrusterPlumeLength } from "./SpaceInvadersVisualUtils";
import { calculateBossPhase, calculateShieldHpRatio } from "../../shared/rendering/spaceInvadersMath";

// ============================================================================
// VISUAL-ONLY EXPLOSION LAYERED PARTICLE POOL (RING, DEBRIS W/ GRAVITY, SMOKE)
// ============================================================================

export interface VisualExplosionParticle {
  active: boolean;
  type: "ring" | "debris" | "smoke";
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number; // For expanding rings
  maxRadius: number;
  size: number;
  life: number;
  maxLife: number;
  color: string;
}

const EXPLOSION_POOL_SIZE = 300;
export const EXPLOSION_PARTICLE_POOL: VisualExplosionParticle[] = Array.from({ length: EXPLOSION_POOL_SIZE }, () => ({
  active: false,
  type: "debris",
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  radius: 0,
  maxRadius: 0,
  size: 0,
  life: 0,
  maxLife: 0,
  color: "#FFFFFF"
}));

export function spawnLayeredExplosion(
  x: number,
  y: number,
  baseColor: string = "#00FFFF",
  intensityMultiplier: number = 1.0
): void {
  const pseudoRand = (seed: number) => {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  };

  let seedIndex = x * 1000 + y;

  const nextRnd = () => {
    seedIndex += 1.357;
    return pseudoRand(seedIndex);
  };

  // Layer 2: Expanding Ring
  for (let j = 0; j < EXPLOSION_PARTICLE_POOL.length; j++) {
    const p = EXPLOSION_PARTICLE_POOL[j];
    if (!p.active) {
      p.active = true;
      p.type = "ring";
      p.x = x;
      p.y = y;
      p.vx = 0;
      p.vy = 0;
      p.radius = 2;
      p.maxRadius = (35 + nextRnd() * 25) * intensityMultiplier;
      p.size = 2;
      p.life = 0.35 * intensityMultiplier;
      p.maxLife = p.life;
      p.color = baseColor;
      break;
    }
  }

  // Layer 3: Debris with gravity
  const debrisCount = Math.floor((12 + nextRnd() * 8) * intensityMultiplier);
  for (// TODO(refactor): código duplicado detectado (bloque) con space-invaders/rendering/SpaceInvadersCanvasVisuals.ts:105-110. Considerar extraer a función compartida. Ref: d0b985bf
  let i = 0; i < debrisCount; i++) {
    for (let j = 0; j < EXPLOSION_PARTICLE_POOL.length; j++) {
      const p = EXPLOSION_PARTICLE_POOL[j];
      if (!p.active) {
        const angle = nextRnd() * Math.PI * 2;
        const speed = (60 + nextRnd() * 180) * intensityMultiplier;
        p.active = true;
        p.type = "debris";
        p.x = x;
        p.y = y;
        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed - 30; // slight initial upward velocity
        p.size = 2 + nextRnd() * 3.5;
        p.life = (0.4 + nextRnd() * 0.4) * intensityMultiplier;
        p.maxLife = p.life;
        p.color = nextRnd() > 0.4 ? baseColor : "#FFFFFF";
        break;
      }
    }
  }

  // Layer 4: Residual smoke
  const smokeCount = Math.floor((6 + nextRnd() * 6) * intensityMultiplier);
  for (let i = 0; i < smokeCount; i++) {
    for (let j = 0; j < EXPLOSION_PARTICLE_POOL.length; j++) {
      const p = EXPLOSION_PARTICLE_POOL[j];
      if (!p.active) {
        const angle = nextRnd() * Math.PI * 2;
        const speed = (15 + nextRnd() * 40) * intensityMultiplier;
        p.active = true;
        p.type = "smoke";
        p.x = x;
        p.y = y;
        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed - 15; // gentle smoke drift upward
        p.size = 4 + nextRnd() * 6;
        p.life = (0.8 + nextRnd() * 0.6) * intensityMultiplier;
        p.maxLife = p.life;
        p.color = "#888888";
        break;
      }
    }
  }
}

export function updateExplosionParticles(dt: number = 0.016): void {
  const gravity = 250; // gravity on debris
  for (let i = 0; i < EXPLOSION_PARTICLE_POOL.length; i++) {
    const p = EXPLOSION_PARTICLE_POOL[i];
    if (p.active) {
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }

      if (p.type === "ring") {
        const progress = 1.0 - p.life / p.maxLife;
        p.radius = p.maxRadius * progress;
      } else if (p.type === "debris") {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += gravity * dt; // Gravity pull
        p.vx *= 0.96; // drag
      } else if (p.type === "smoke") {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.92;
        p.vy *= 0.92;
        p.size += dt * 8; // expanding smoke cloud
      }
    }
  }
}

export function drawExplosionParticlesCanvas(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  for (let i = 0; i < EXPLOSION_PARTICLE_POOL.length; i++) {
    const p = EXPLOSION_PARTICLE_POOL[i];
    if (!p.active) continue;

    const ratio = Math.max(0, p.life / p.maxLife);

    if (p.type === "ring") {
      ctx.save();
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2.5 * ratio;
      ctx.globalAlpha = ratio * 0.8;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.1, p.radius), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else if (p.type === "debris") {
      ctx.save();
      ctx.fillStyle = p.color;
      ctx.globalAlpha = ratio;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      ctx.restore();
    } else if (p.type === "smoke") {
      ctx.save();
      ctx.fillStyle = p.color;
      ctx.globalAlpha = ratio * 0.35;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.1, p.size), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.restore();
}

/**
 * Background drawer for layered visual explosion particles.
 */
export const drawExplosionBackgroundEffect: EffectDrawer<CanvasRenderingContext2D, SpaceInvadersComponentRegistry> = {
  draw(ctx) {
    updateExplosionParticles();
    drawExplosionParticlesCanvas(ctx);
  }
};

/**
 * Visuals for the player ship.
 * Incorporates:
 * - High-fidelity futuristic cockpit chassis design.
 * - Dynamic tilt/leaning on movement based on horizontal velocity.
 * - Flickering, dual-stage thruster plasma plume tail.
 * - Glowing defensive neon invulnerability bubble shield when invulnerable.
 */
export const drawSpaceInvadersPlayer: ShapeDrawer<CanvasRenderingContext2D, SpaceInvadersComponentRegistry> = {
  draw(ctx, world, entity) {
    const render = world.getComponent(entity, "Render");
    if (!render) return;
    const { size = 40 } = render;

    const flash = applyHitFlash(render, render.color || colors.green);
    const color = flash.color;

    ctx.save();
    ctx.globalAlpha = flash.opacity;

    // 1. Dynamic tilt/lean based on horizontal velocity
    const velocity = world.getComponent(entity, "Velocity");
    if (velocity) {
      const tilt = calculatePlayerTilt(velocity.vx);
      ctx.rotate(tilt);
    }

    // 2. Flickering dual-stage thruster plume tail (at the bottom)
    const tick = world.tick;
    const plumeLength = calculateThrusterPlumeLength(tick, size);

    // Outer plasma flame
    ctx.fillStyle = colors.orangeDark;
    ctx.beginPath();
    ctx.moveTo(-size / 5, size / 4);
    ctx.lineTo(size / 5, size / 4);
    ctx.lineTo(0, size / 4 + plumeLength);
    ctx.closePath();
    ctx.fill();

    // Inner hotter core flame
    ctx.fillStyle = colors.gold;
    ctx.beginPath();
    ctx.moveTo(-size / 8, size / 4);
    ctx.lineTo(size / 8, size / 4);
    ctx.lineTo(0, size / 4 + plumeLength * 0.6);
    ctx.closePath();
    ctx.fill();

    // 3. Futuristic high-fidelity cockpit, body wings, and neon trims
    ctx.fillStyle = color;

    // Main central chassis
    ctx.beginPath();
    ctx.moveTo(0, -size / 2); // nose tip
    ctx.lineTo(size / 4, -size / 6);
    ctx.lineTo(size / 2, size / 4); // right sweep wing
    ctx.lineTo(size / 3, size / 4);
    ctx.lineTo(size / 5, size / 6); // right hull intake
    ctx.lineTo(-size / 5, size / 6); // left hull intake
    ctx.lineTo(-size / 3, size / 4);
    ctx.lineTo(-size / 2, size / 4); // left sweep wing
    ctx.lineTo(-size / 4, -size / 6);
    ctx.closePath();
    ctx.fill();

    // Neon Wingtips / Cannons
    ctx.strokeStyle = colors.cyan;
    ctx.lineWidth = 2;
    ctx.beginPath();
    // Left Cannon
    ctx.moveTo(-size / 3, size / 6);
    ctx.lineTo(-size / 3, -size / 3);
    // Right Cannon
    ctx.moveTo(size / 3, size / 6);
    ctx.lineTo(size / 3, -size / 3);
    ctx.stroke();

    // Cannons white cores
    ctx.fillStyle = colors.white;
    ctx.fillRect(-size / 3 - 1, -size / 3, 2, size / 4);
    ctx.fillRect(size / 3 - 1, -size / 3, 2, size / 4);

    // Dynamic Muzzle Fire Recoil & Energetic Tip Flares
    const isShooting = isPlayerShooting(world, entity);
    if (isShooting) {
      const flashSize = 3.5 + 1.5 * Math.sin(tick * 0.8);
      ctx.fillStyle = "#00FFFF";
      ctx.shadowColor = "#00FFFF";
      ctx.shadowBlur = 10;

      // Left Cannon Muzzle Flash
      ctx.beginPath();
      ctx.arc(-size / 3, -size / 3 - 2, flashSize, 0, Math.PI * 2);
      ctx.fill();

      // Right Cannon Muzzle Flash
      ctx.beginPath();
      ctx.arc(size / 3, -size / 3 - 2, flashSize, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.shadowColor = "transparent";
    }

    // High-energy cockpit glass canopy (Cyan)
    ctx.fillStyle = colors.cyan;
    ctx.beginPath();
    ctx.moveTo(0, -size / 3);
    ctx.lineTo(size / 6, -size / 10);
    ctx.lineTo(size / 8, size / 8);
    ctx.lineTo(-size / 8, size / 8);
    ctx.lineTo(-size / 6, -size / 10);
    ctx.closePath();
    ctx.fill();

    // Inner bright white cockpit reflection
    ctx.fillStyle = colors.white;
    ctx.beginPath();
    ctx.moveTo(-size / 12, -size / 5);
    ctx.lineTo(0, -size / 4);
    ctx.lineTo(size / 12, -size / 5);
    ctx.closePath();
    ctx.fill();

    // TODO(refactor): código duplicado detectado (bloque) con space-invaders/rendering/SpaceInvadersSkiaVisuals.ts:154-161. Considerar extraer a función compartida. Ref: ac8bf58e
    ctx.restore();

    // 4. Glowing defensive neon invulnerability bubble shield (Pulsing blue/cyan)
    const health = world.getComponent(entity, "Health");
    if (health && health.invulnerableRemaining !== undefined && health.invulnerableRemaining > 0) {
      const shieldPulse = 1.0 + 0.08 * Math.sin(tick / 4);
      const shieldAlpha = 0.35 + 0.15 * Math.sin(tick / 4 + Math.PI);
      const radius = size * 0.72 * shieldPulse;

      ctx.save();
      ctx.strokeStyle = colors.cyan;
      ctx.lineWidth = 3;
      ctx.globalAlpha = shieldAlpha;
      ctx.shadowColor = colors.cyan;
      ctx.shadowBlur = 12;

      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.stroke();

      // Soft shield body fill
      ctx.fillStyle = "rgba(0, 240, 255, 0.08)";
      ctx.fill();

      // Inner electric ring
      ctx.strokeStyle = colors.blue;
      ctx.lineWidth = 1.5;
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.82, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    }

    ctx.globalAlpha = 1.0;
  }
};

/**
 * Visuals for an invader.
 * Incorporates:
 * - Row-based distinct colors (magenta commanders, cyan scouts, gold grunts).
 * - Multi-stage procedural eye/core pulses using sine-waves.
 * - Organic pixel leg walking animations based on ticks.
 */
export const drawSpaceInvadersInvader: ShapeDrawer<CanvasRenderingContext2D, SpaceInvadersComponentRegistry> = {
  draw(ctx, world, entity) {
    const render = world.getComponent(entity, "Render");
    if (!render) return;
    // TODO(refactor): código duplicado detectado (bloque) con space-invaders/rendering/SpaceInvadersSkiaVisuals.ts:201-216. Considerar extraer a función compartida. Ref: ac0fb50f
    const { size = 15 } = render;

    let baseColor = render.color || colors.white;
    const invaderComp = world.getComponent(entity, "Invader");
    if (invaderComp) {
      const row = invaderComp.row;
      if (row === 0) {
        baseColor = colors.magentaHot; // Row 0 (Commanders): Hot Magenta
      } else if (row <= 2) {
        baseColor = colors.cyan; // Rows 1-2 (Scouts): Electric Cyan
      } else {
        baseColor = colors.gold; // Rows 3-4 (Grunts): Cyber Gold
      }
    }

    const flash = applyHitFlash(render, baseColor);
    ctx.globalAlpha = flash.opacity;
    const color = flash.color;

    ctx.fillStyle = color;

    // Simple pixelated invader shape
    const s = size / 11;
    const tick = world.tick;
    // Walk animation toggles legs state organically
    const animPhase = Math.floor(tick / 15) % 2 === 0;

    // Head/Antennae
    ctx.fillRect(-s * 4, -s * 5, s, s);
    ctx.fillRect(s * 3, -s * 5, s, s);
    ctx.fillRect(-s * 3, -s * 4, s, s);
    ctx.fillRect(s * 2, -s * 4, s, s);

    // Main Face
    ctx.fillRect(-s * 4, -s * 3, s * 8, s * 4);

    // Tentacles/Legs that animate!
    if (animPhase) {
      // Leg Position A
      ctx.fillRect(-s * 5, -s, s, s * 3);
      ctx.fillRect(s * 4, -s, s, s * 3);
      ctx.fillRect(-s * 3, s, s * 2, s);
      ctx.fillRect(s * 1, s, s * 2, s);
      ctx.fillRect(-s * 2, s * 2, s, s);
      ctx.fillRect(s * 1, s * 2, s, s);
    } else {
      // Leg Position B
      ctx.fillRect(-s * 4, -s, s, s * 2);
      ctx.fillRect(s * 3, -s, s, s * 2);
      ctx.fillRect(-s * 5, s, s, s * 2);
      ctx.fillRect(s * 4, s, s, s * 2);
      ctx.fillRect(-s * 2, s, s, s * 2);
      ctx.fillRect(s * 1, s, s * 2, s);
    }

    // Glowing alien cyber-cores/eyes (Dynamic glowing orange/red center)
    const eyePulse = 0.5 + 0.5 * Math.abs(Math.sin(tick / 6));
    ctx.fillStyle = colors.redHot;
    ctx.shadowColor = colors.redHot;
    ctx.shadowBlur = 6 * eyePulse;
    ctx.fillRect(-s * 2, -s * 2, s, s);
    ctx.fillRect(s, -s * 2, s, s);

    // Reset shadow blur
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1.0;
  }
};

/**
 * Visuals for bullets.
 * - Player projectiles render as high-energy cyan plasma bolts with trails.
 * - Enemy projectiles render as aggressive crimson glowing plasma capsules with trails.
 */
export const drawSpaceInvadersBullet: ShapeDrawer<CanvasRenderingContext2D, SpaceInvadersComponentRegistry> = {
  draw(ctx, world, entity) {
    const render = world.getComponent(entity, "Render");
    if (!render) return;
    // TODO(refactor): código duplicado detectado (bloque) con space-invaders/rendering/SpaceInvadersSkiaVisuals.ts:270-293. Considerar extraer a función compartida. Ref: d2d6b392
    const { size = 4 } = render;

    const isPlayerBullet = world.hasComponent(entity, "PlayerBullet");

    const glowColor = isPlayerBullet ? colors.cyan : colors.redHot;
    const coreColor = colors.white;

    // Calculate proximity intensity for enemy bullets prior to impact
    let proximityFactor = 0;
    if (!isPlayerBullet) {
      const pos = world.getComponent(entity, "Transform");
      const ttl = world.getComponent(entity, "TTL");

      let distFactor = 0;
      if (pos) {
        // Player target position is near bottom of screen (~550)
        // As bullet Y progresses past 300 towards 550, increase proximity intensity
        distFactor = Math.max(0, Math.min(1.0, (pos.y - 300) / 220));
      }

      let ttlFactor = 0;
      if (ttl && ttl.timeLeft) {
        ttlFactor = Math.max(0, Math.min(1.0, 1.0 - (ttl.remaining / ttl.timeLeft)));
      }

      proximityFactor = Math.max(distFactor, ttlFactor);
    }

    ctx.save();

    // 1. Draw glowing outer fading capsules as motion trails
    const baseTrailAlpha = isPlayerBullet ? 0.18 : (0.18 + proximityFactor * 0.22);
    ctx.globalAlpha = baseTrailAlpha;
    ctx.fillStyle = glowColor;
    const trailOffset = isPlayerBullet ? size * 1.5 : -size * (1.5 + proximityFactor * 0.8);

    for (let i = 1; i <= 3; i++) {
      ctx.fillRect(-size / 2, -size + (trailOffset * i), size, size * 2);
    }

    // 2. Draw outer energetic glowing aura (intensifies near target for enemy bullets)
    const baseAuraAlpha = isPlayerBullet ? 0.4 : (0.4 + proximityFactor * 0.4);
    const shadowBlurAmount = isPlayerBullet ? 8 : (8 + proximityFactor * 16);
    ctx.globalAlpha = baseAuraAlpha;
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = shadowBlurAmount;
    const auraSizeScale = 1.0 + proximityFactor * 0.3;
    ctx.fillRect(-size * 1.25 * auraSizeScale, -size * 1.25 * auraSizeScale, size * 2.5 * auraSizeScale, size * 2.5 * auraSizeScale);

    // 3. Draw solid primary energetic bolt
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = glowColor;
    ctx.fillRect(-size / 2, -size, size, size * 2);

    // 4. Draw bright white core
    ctx.fillStyle = coreColor;
    ctx.fillRect(-size / 4, -size * 0.7, size / 2, size * 1.4);

    ctx.restore();
  }
};

/**
 * Visuals for the Boss flagship.
 * Features phase-based adaptive presentation:
 * - Phase 1 (HP > 66%): Commanding Deep Magenta/Cyan energy shield, intact armored hull.
 * - Phase 2 (33% < HP <= 66%): Warning Cyber Gold/Orange tone, hull damage cracks, accelerated core pulse.
 * - Phase 3 (HP <= 33%): Overdrive Crimson/Red-Hot enraged aura, flickering core instability flares.
 */
export const drawSpaceInvadersBoss: ShapeDrawer<CanvasRenderingContext2D, SpaceInvadersComponentRegistry> = {
  draw(ctx, world, entity) {
    const render = world.getComponent(entity, "Render");
    if (!render) return;
    // TODO(refactor): código duplicado detectado (bloque) con space-invaders/rendering/SpaceInvadersSkiaVisuals.ts:321-343. Considerar extraer a función compartida. Ref: 0328253c
    const { size = 80 } = render;

    const boss = world.getComponent(entity, "Boss");
    const health = world.getComponent(entity, "Health");

    const currentHp = health ? health.current : (boss ? boss.hp : 50);
    const maxHp = health ? health.max : (boss ? boss.maxHp : 50);
    const hpRatio = calculateShieldHpRatio(currentHp, maxHp);

    const { phase, baseColor, accentColor } = calculateBossPhase(hpRatio);

    const flash = applyHitFlash(render, baseColor);
    const color = flash.color;

    ctx.save();
    ctx.globalAlpha = flash.opacity;

    const tick = world.tick;
    const s = size / 20;

    // 1. Phase 3 Overdrive Energy Aura Glow
    if (phase === 3) {
      const auraPulse = 1.0 + 0.15 * Math.sin(tick * 0.4);
      ctx.shadowColor = colors.redHot;
      ctx.shadowBlur = 15 * auraPulse;
    } else if (phase === 2) {
      ctx.shadowColor = colors.gold;
      ctx.shadowBlur = 8;
    }

    // 2. Heavy Armored Mothership Hull Shape
    ctx.fillStyle = color;
    ctx.beginPath();
    // Central Command Spire / Nose
    ctx.moveTo(0, -s * 8);
    ctx.lineTo(s * 4, -s * 4);
    // Right Heavy Armor Wing
    ctx.lineTo(s * 10, -s * 2);
    ctx.lineTo(s * 9, s * 4);
    ctx.lineTo(s * 6, s * 8);
    ctx.lineTo(s * 3, s * 6);
    // Central Engine Intake
    ctx.lineTo(0, s * 7);
    // Left Heavy Armor Wing
    ctx.lineTo(-s * 3, s * 6);
    ctx.lineTo(-s * 6, s * 8);
    ctx.lineTo(-s * 9, s * 4);
    ctx.lineTo(-s * 10, -s * 2);
    ctx.lineTo(-s * 4, -s * 4);
    ctx.closePath();
    ctx.fill();

    // Reset shadow blur
    ctx.shadowBlur = 0;

    // 3. Phase Accent Trims & Secondary Cannons
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    // Wing Cannons
    ctx.moveTo(-s * 8, -s * 2);
    ctx.lineTo(-s * 8, -s * 6);
    ctx.moveTo(s * 8, -s * 2);
    ctx.lineTo(s * 8, -s * 6);
    ctx.stroke();

    // 4. Phase-based Core Reaction Chamber
    const pulseSpeed = phase === 3 ? 0.3 : phase === 2 ? 0.15 : 0.08;
    const corePulse = 0.5 + 0.5 * Math.sin(tick * pulseSpeed);
    const coreRadius = s * (3.5 + 1.2 * corePulse);

    ctx.fillStyle = phase === 3 ? colors.white : accentColor;
    ctx.beginPath();
    ctx.arc(0, 0, coreRadius, 0, Math.PI * 2);
    ctx.fill();

    // 5. Procedural Damage Cracks Overlay in Phase 2 & Phase 3
    if (hpRatio < 1.0) {
      ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
      ctx.lineWidth = 2;
      ctx.beginPath();

      ctx.moveTo(-s * 6, -s * 2);
      ctx.lineTo(s * 2, s * 4);

      if (phase === 3) {
        ctx.moveTo(s * 5, -s * 3);
        ctx.lineTo(-s * 3, s * 5);
      }
      ctx.stroke();
    }

    ctx.restore();
  }
};

/**
 * Visuals for shield blocks.
 * - Layered high-tech hex barricade structures.
 * - Neon green outer outline.
 * - Real damage cracks and fragmenting line patterns overlay based on segment HP ratio.
 */
export const drawSpaceInvadersShield: ShapeDrawer<CanvasRenderingContext2D, SpaceInvadersComponentRegistry> = {
  draw(ctx, world, entity) {
    const render = world.getComponent(entity, "Render");
    if (!render) return;
    const { size = 15 } = render;

    const flash = applyHitFlash(render, render.color || colors.green);
    // TODO(refactor): código duplicado detectado (bloque) con space-invaders/rendering/SpaceInvadersSkiaVisuals.ts:422-427. Considerar extraer a función compartida. Ref: a85d2ee2
    const color = flash.color;

    const shield = world.getComponent(entity, "Shield");
    const hp = shield ? shield.hp : 3;
    const maxHp = shield ? shield.maxHp : 3;
    const ratio = calculateShieldHpRatio(hp, maxHp);

    ctx.save();

    // Draw glowing semi-transparent high-tech energy cell fill
    ctx.fillStyle = color;
    ctx.globalAlpha = flash.opacity * (0.15 + 0.5 * ratio);
    ctx.fillRect(-size / 2, -size / 2, size, size);

    // Draw glowing contours around undamaged/active shield segments
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = flash.opacity * (0.3 + 0.7 * ratio);
    ctx.strokeRect(-size / 2, -size / 2, size, size);

    // Draw procedural damage cracking overlay lines if damaged
    if (ratio < 1.0) {
      ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 1.0;
      ctx.beginPath();

      // Deterministic cracks based on entity ID as seed
      const seed1 = (entity * 17) % size;
      const seed2 = (entity * 41) % size;
      ctx.moveTo(-size / 2 + seed1, -size / 2);
      ctx.lineTo(size / 2 - seed2, size / 2);

      if (ratio < 0.4) {
        // Double the cracks for highly-damaged cells
        const seed3 = (entity * 97) % size;
        ctx.moveTo(size / 2, -size / 2 + seed3);
        ctx.lineTo(-size / 2, size / 2 - seed3);
      }
      ctx.stroke();
    }

    ctx.restore();
    ctx.globalAlpha = 1.0;
  }
};

/**
 * Visuals for particles.
 * - Zero-allocation heat-dissipation color shifting model.
 * - Sparks start glowing white/yellow, fade to orange, red, and scale down dynamically by TTL.
 */
export const drawSpaceInvadersParticle: ShapeDrawer<CanvasRenderingContext2D, SpaceInvadersComponentRegistry> = {
  draw(ctx, world, entity) {
    const render = world.getComponent(entity, "Render");
    if (!render) return;
    // TODO(refactor): código duplicado detectado (bloque) con space-invaders/rendering/SpaceInvadersSkiaVisuals.ts:491-502. Considerar extraer a función compartida. Ref: 10ae45f2
    const { size = 2, color = "white" } = render;

    const ttl = world.getComponent(entity, "TTL");
    let progress = 0.5;

    if (ttl && ttl.remaining !== undefined) {
      const totalLife = ttl.timeLeft || 0.5;
      progress = Math.max(0, Math.min(1.0, 1.0 - (ttl.remaining / totalLife)));
    }

    // Zero-allocation heat-dissipation color shifting
    let particleColor = color;
    // TODO(refactor): código duplicado detectado (bloque) con space-invaders/rendering/SpaceInvadersSkiaVisuals.ts:503-515. Considerar extraer a función compartida. Ref: 2c9a8f76
    if (color === "white") {
      if (progress < 0.2) {
        particleColor = colors.white; // Hot white
      } else if (progress < 0.45) {
        particleColor = colors.yellow; // Yellow flare
      } else if (progress < 0.7) {
        particleColor = colors.orange; // Dissipating Orange
      } else {
        particleColor = colors.red; // Red ember
      }
    }

    // Scale down proportionally to remaining life
    const currentSize = Math.max(0.5, size * (1.1 - progress));

    ctx.save();
    ctx.globalAlpha = 1.0 - progress;
    ctx.fillStyle = particleColor;

    // Glowing shadow for hotter particles
    if (progress < 0.5) {
      ctx.shadowColor = particleColor;
      ctx.shadowBlur = 6 * (1.0 - progress);
    }

    ctx.beginPath();
    ctx.arc(0, 0, currentSize / 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
};

/**
 * Screen shake background effect.
 */
export const spaceInvadersScreenShakeEffect: EffectDrawer<CanvasRenderingContext2D, SpaceInvadersComponentRegistry> = {
  draw(ctx, world) {
    const gameState = world.getSingleton("GameState");
    if (gameState && gameState.screenShake && gameState.screenShake.duration > 0) {
      const { intensity, elapsed = 0, totalDuration = 0.3 } = gameState.screenShake as any;
      const progress = elapsed / (totalDuration || 0.3);

      // Attack-Sustain-Decay screen shake envelope
      const attackTime = 0.1;
      const sustainTime = 0.2;
      const decayTime = 0.7;

      let env = 1.0;
      if (progress < attackTime) {
        env = progress / attackTime;
      } else if (progress < attackTime + sustainTime) {
        env = 1.0;
      } else {
        const decayProgress = (progress - attackTime - sustainTime) / decayTime;
        env = Math.max(0, 1.0 - decayProgress);
      }

      const currentIntensity = intensity * env;
      const renderRandom = world.renderRandom;
      const dx = (renderRandom.next() - 0.5) * currentIntensity;
      const dy = (renderRandom.next() - 0.5) * currentIntensity;
      ctx.translate(dx, dy);
    }
  }
};
