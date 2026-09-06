import { ShapeDrawer, World, ShapeType, CircleShape, ColliderComponent, RenderComponent, TransformComponent } from "@tiny-aster/core";
import { SpaceInvadersComponentRegistry } from "../types/SpaceInvadersTypes";
import { colors } from "../../../theme/colors";
// TODO(refactor): código duplicado detectado (bloque) con asteroids/rendering/AsteroidsSkiaVisuals.ts:4-20. Considerar extraer a función compartida. Ref: 20bf4f89
import { applyHitFlash, isPlayerShooting, calculatePlayerTilt, calculateThrusterPlumeLength } from "./SpaceInvadersVisualUtils";
import { calculateBossPhase, calculateShieldHpRatio } from "../../shared/rendering/spaceInvadersMath";

import { Skia, getPaint } from "../../shared/rendering/SkiaContext";

// Memory-safe caching for zero-allocation player ship pathing
const cachedPlayerPaths = new WeakMap<any, { chassis: any; cockpit: any; reflection: any }>();
const cachedShieldCracks = new WeakMap<any, { x1: number; y1: number; x2: number; y2: number; x3: number; y3: number; x4: number; y4: number }>();

/**
 * Visuals for the player ship using React Native Skia.
 * Functional visual parity with HTML5 Canvas:
 * - High-fidelity futuristic cockpit chassis design.
 * - Dynamic tilt/leaning on movement based on horizontal velocity.
 * - Flickering, dual-stage thruster plasma plume tail.
 * - Glowing defensive neon invulnerability bubble shield when invulnerable.
 */
// TODO(refactor): código duplicado detectado (bloque) con space-invaders/rendering/SpaceInvadersSkiaVisuals.ts:195-201. Considerar extraer a función compartida. Ref: f43bc0df
export const drawSkiaSpaceInvadersPlayer: ShapeDrawer<any, SpaceInvadersComponentRegistry> = {
  draw(canvas, world, entity) {
    if (!Skia) return;
    const render = world.getComponent(entity, "Render") as RenderComponent | undefined;
    if (!render) return;

    const size = render.size || 40;
    const flash = applyHitFlash(render, render.color || colors.green, render.opacity ?? 1.0);
    const colorStr = flash.color;
    const opacity = flash.opacity;

    canvas.save();

    // 1. Dynamic tilt/lean based on horizontal velocity
    const velocity = world.getComponent(entity, "Velocity");
    if (velocity) {
      const tilt = calculatePlayerTilt(velocity.vx);
      canvas.rotate((tilt * 180) / Math.PI, 0, 0);
    }

    const paint = getPaint();
    paint.reset();
    paint.setAntiAlias(true);

    // 2. Flickering dual-stage thruster plume tail (at the bottom)
    const tick = world.tick;
    const plumeLength = calculateThrusterPlumeLength(tick, size);

    // Outer plasma flame
    paint.setStyle(Skia.PaintStyle.Fill);
    paint.setColor(Skia.Color(colors.orangeDark));
    paint.setAlphaf(opacity * 0.8);
    const outerFlame = Skia.Path.Make();
    outerFlame.moveTo(-size / 5, size / 4);
    outerFlame.lineTo(size / 5, size / 4);
    outerFlame.lineTo(0, size / 4 + plumeLength);
    outerFlame.close();
    canvas.drawPath(outerFlame, paint);

    // Inner hotter core flame
    paint.setColor(Skia.Color(colors.gold));
    paint.setAlphaf(opacity);
    const innerFlame = Skia.Path.Make();
    innerFlame.moveTo(-size / 8, size / 4);
    innerFlame.lineTo(size / 8, size / 4);
    innerFlame.lineTo(0, size / 4 + plumeLength * 0.6);
    innerFlame.close();
    canvas.drawPath(innerFlame, paint);

    // 3. Retrieve or create cached paths for static chassis
    let paths = cachedPlayerPaths.get(render);
    if (!paths) {
      // Main central chassis
      const chassis = Skia.Path.Make();
      chassis.moveTo(0, -size / 2); // nose tip
      chassis.lineTo(size / 4, -size / 6);
      chassis.lineTo(size / 2, size / 4); // right sweep wing
      chassis.lineTo(size / 3, size / 4);
      chassis.lineTo(size / 5, size / 6); // right hull intake
      chassis.lineTo(-size / 5, size / 6); // left hull intake
      chassis.lineTo(-size / 3, size / 4);
      chassis.lineTo(-size / 2, size / 4); // left sweep wing
      chassis.lineTo(-size / 4, -size / 6);
      chassis.close();

      // High-energy cockpit glass canopy
      const cockpit = Skia.Path.Make();
      cockpit.moveTo(0, -size / 3);
      cockpit.lineTo(size / 6, -size / 10);
      cockpit.lineTo(size / 8, size / 8);
      cockpit.lineTo(-size / 8, size / 8);
      cockpit.lineTo(-size / 6, -size / 10);
      cockpit.close();

      // Inner bright white cockpit reflection
      const reflection = Skia.Path.Make();
      reflection.moveTo(-size / 12, -size / 5);
      reflection.lineTo(0, -size / 4);
      reflection.lineTo(size / 12, -size / 5);
      reflection.close();

      paths = { chassis, cockpit, reflection };
      cachedPlayerPaths.set(render, paths);
    }

    // Draw central chassis
    paint.reset();
    paint.setAntiAlias(true);
    paint.setStyle(Skia.PaintStyle.Fill);
    paint.setColor(Skia.Color(colorStr));
    paint.setAlphaf(opacity);
    canvas.drawPath(paths.chassis, paint);

    // Neon Wingtips / Cannons
    paint.setStyle(Skia.PaintStyle.Stroke);
    paint.setColor(Skia.Color(colors.cyan));
    paint.setStrokeWidth(2);
    canvas.drawLine(-size / 3, size / 6, -size / 3, -size / 3, paint);
    canvas.drawLine(size / 3, size / 6, size / 3, -size / 3, paint);

    // Cannons white cores
    paint.setStyle(Skia.PaintStyle.Fill);
    paint.setColor(Skia.Color(colors.white));
    canvas.drawRect(Skia.XYWHRect(-size / 3 - 1, -size / 3, 2, size / 4), paint);
    canvas.drawRect(Skia.XYWHRect(size / 3 - 1, -size / 3, 2, size / 4), paint);

    // Dynamic Muzzle Fire Recoil & Energetic Tip Flares
    const isShooting = isPlayerShooting(world, entity);
    if (isShooting) {
      const flashSize = 3.5 + 1.5 * Math.sin(tick * 0.8);
      paint.setColor(Skia.Color("#00FFFF"));
      canvas.drawCircle(-size / 3, -size / 3 - 2, flashSize, paint);
      canvas.drawCircle(size / 3, -size / 3 - 2, flashSize, paint);
    }

    // High-energy cockpit glass canopy (Cyan)
    paint.setColor(Skia.Color(colors.cyan));
    canvas.drawPath(paths.cockpit, paint);

    // Inner bright white cockpit reflection
    paint.setColor(Skia.Color(colors.white));
    canvas.drawPath(paths.reflection, paint);

    // TODO(refactor): código duplicado detectado (bloque) con space-invaders/rendering/SpaceInvadersCanvasVisuals.ts:132-139. Considerar extraer a función compartida. Ref: ac8bf58e
    canvas.restore();

    // 4. Glowing defensive neon invulnerability bubble shield (Pulsing blue/cyan)
    const health = world.getComponent(entity, "Health");
    if (health && health.invulnerableRemaining !== undefined && health.invulnerableRemaining > 0) {
      const shieldPulse = 1.0 + 0.08 * Math.sin(tick / 4);
      const shieldAlpha = 0.35 + 0.15 * Math.sin(tick / 4 + Math.PI);
      const radius = size * 0.72 * shieldPulse;

      canvas.save();

      // Soft shield body fill
      paint.reset();
      paint.setAntiAlias(true);
      paint.setStyle(Skia.PaintStyle.Fill);
      paint.setColor(Skia.Color("rgba(0, 240, 255, 0.08)"));
      paint.setAlphaf(shieldAlpha * 0.5);
      canvas.drawCircle(0, 0, radius, paint);

      // Outer ring
      paint.setStyle(Skia.PaintStyle.Stroke);
      paint.setColor(Skia.Color(colors.cyan));
      paint.setStrokeWidth(3);
      paint.setAlphaf(shieldAlpha);
      canvas.drawCircle(0, 0, radius, paint);

      // Inner electric ring
      paint.setColor(Skia.Color(colors.blue));
      paint.setStrokeWidth(1.5);
      paint.setAlphaf(shieldAlpha * 0.6);
      canvas.drawCircle(0, 0, radius * 0.82, paint);

      canvas.restore();
    }
  }
};

/**
 * Visuals for an invader using React Native Skia.
 * Row-based colors, pulsing cyber eye core, leg animations.
 */
// TODO(refactor): código duplicado detectado (bloque) con space-invaders/rendering/SpaceInvadersSkiaVisuals.ts:33-39. Considerar extraer a función compartida. Ref: d30640a5
export const drawSkiaSpaceInvadersInvader: ShapeDrawer<any, SpaceInvadersComponentRegistry> = {
  draw(canvas, world, entity) {
    if (!Skia) return;
    const render = world.getComponent(entity, "Render") as RenderComponent | undefined;
    if (!render) return;

    // TODO(refactor): código duplicado detectado (bloque) con space-invaders/rendering/SpaceInvadersCanvasVisuals.ts:181-196. Considerar extraer a función compartida. Ref: ac0fb50f
    const size = render.size || 15;
    let baseColor = render.color || colors.white;

    const invaderComp = world.getComponent(entity, "Invader");
    if (invaderComp) {
      const row = invaderComp.row;
      if (row === 0) {
        baseColor = colors.magentaHot; // Hot Magenta
      } else if (row <= 2) {
        baseColor = colors.cyan; // Electric Cyan
      } else {
        baseColor = colors.gold; // Cyber Gold
      }
    }

    const flash = applyHitFlash(render, baseColor, render.opacity ?? 1.0);
    const colorStr = flash.color;
    const opacity = flash.opacity;

    const s = size / 11;
    const tick = world.tick;
    const animPhase = Math.floor(tick / 15) % 2 === 0;

    const paint = getPaint();
    paint.reset();
    paint.setStyle(Skia.PaintStyle.Fill);
    paint.setColor(Skia.Color(colorStr));
    paint.setAlphaf(opacity);

    // Draw Head/Antennae
    canvas.drawRect(Skia.XYWHRect(-s * 4, -s * 5, s, s), paint);
    canvas.drawRect(Skia.XYWHRect(s * 3, -s * 5, s, s), paint);
    canvas.drawRect(Skia.XYWHRect(-s * 3, -s * 4, s, s), paint);
    canvas.drawRect(Skia.XYWHRect(s * 2, -s * 4, s, s), paint);

    // Main Face
    canvas.drawRect(Skia.XYWHRect(-s * 4, -s * 3, s * 8, s * 4), paint);

    // Tentacles/Legs that animate!
    if (animPhase) {
      canvas.drawRect(Skia.XYWHRect(-s * 5, -s, s, s * 3), paint);
      canvas.drawRect(Skia.XYWHRect(s * 4, -s, s, s * 3), paint);
      canvas.drawRect(Skia.XYWHRect(-s * 3, s, s * 2, s), paint);
      canvas.drawRect(Skia.XYWHRect(s * 1, s, s * 2, s), paint);
      canvas.drawRect(Skia.XYWHRect(-s * 2, s * 2, s, s), paint);
      canvas.drawRect(Skia.XYWHRect(s * 1, s * 2, s, s), paint);
    } else {
      canvas.drawRect(Skia.XYWHRect(-s * 4, -s, s, s * 2), paint);
      canvas.drawRect(Skia.XYWHRect(s * 3, -s, s, s * 2), paint);
      canvas.drawRect(Skia.XYWHRect(-s * 5, s, s, s * 2), paint);
      canvas.drawRect(Skia.XYWHRect(s * 4, s, s, s * 2), paint);
      canvas.drawRect(Skia.XYWHRect(-s * 2, s, s, s * 2), paint);
      canvas.drawRect(Skia.XYWHRect(s * 1, s, s * 2, s), paint);
    }

    // Glowing alien cyber-cores/eyes (Dynamic glowing orange/red center)
    const eyePulse = 0.5 + 0.5 * Math.abs(Math.sin(tick / 6));
    paint.setColor(Skia.Color(colors.redHot));
    paint.setAlphaf(opacity * eyePulse);
    canvas.drawRect(Skia.XYWHRect(-s * 2, -s * 2, s, s), paint);
    canvas.drawRect(Skia.XYWHRect(s, -s * 2, s, s), paint);
  }
};

/**
 * Visuals for bullets using React Native Skia.
 * High-energy cyan plasma bolts for player, crimson glowing plasma for enemy.
 */
export const drawSkiaSpaceInvadersBullet: ShapeDrawer<any, SpaceInvadersComponentRegistry> = {
  draw(canvas, world, entity) {
    if (!Skia) return;
    const render = world.getComponent(entity, "Render") as RenderComponent | undefined;
    if (!render) return;

    // TODO(refactor): código duplicado detectado (bloque) con space-invaders/rendering/SpaceInvadersCanvasVisuals.ts:458-484. Considerar extraer a función compartida. Ref: d2d6b392
    const size = render.size || 4;
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
        distFactor = Math.max(0, Math.min(1.0, (pos.y - 300) / 220));
      }

      let ttlFactor = 0;
      if (ttl && ttl.timeLeft) {
        ttlFactor = Math.max(0, Math.min(1.0, 1.0 - (ttl.remaining / ttl.timeLeft)));
      }

      proximityFactor = Math.max(distFactor, ttlFactor);
    }

    canvas.save();

    const paint = getPaint();
    paint.reset();
    paint.setStyle(Skia.PaintStyle.Fill);

    // 1. Draw glowing outer fading capsules as motion trails
    paint.setColor(Skia.Color(glowColor));
    const baseTrailAlpha = isPlayerBullet ? 0.18 : (0.18 + proximityFactor * 0.22);
    paint.setAlphaf(baseTrailAlpha);
    const trailOffset = isPlayerBullet ? size * 1.5 : -size * (1.5 + proximityFactor * 0.8);

    for (let i = 1; i <= 3; i++) {
      canvas.drawRect(Skia.XYWHRect(-size / 2, -size + (trailOffset * i), size, size * 2), paint);
    }

    // 2. Draw outer energetic glowing aura
    const baseAuraAlpha = isPlayerBullet ? 0.4 : (0.4 + proximityFactor * 0.4);
    paint.setAlphaf(baseAuraAlpha);
    const auraSizeScale = 1.0 + proximityFactor * 0.3;
    canvas.drawRect(Skia.XYWHRect(-size * 1.25 * auraSizeScale, -size * 1.25 * auraSizeScale, size * 2.5 * auraSizeScale, size * 2.5 * auraSizeScale), paint);

    // 3. Draw solid primary energetic bolt
    paint.setAlphaf(1.0);
    canvas.drawRect(Skia.XYWHRect(-size / 2, -size, size, size * 2), paint);

    // 4. Draw bright white core
    paint.setColor(Skia.Color(coreColor));
    canvas.drawRect(Skia.XYWHRect(-size / 4, -size * 0.7, size / 2, size * 1.4), paint);

    canvas.restore();
  }
};

/**
 * Visuals for the Boss flagship using React Native Skia.
 */
export const drawSkiaSpaceInvadersBoss: ShapeDrawer<any, SpaceInvadersComponentRegistry> = {
  draw(canvas, world, entity) {
    if (!Skia) return;
    const render = world.getComponent(entity, "Render") as RenderComponent | undefined;
    if (!render) return;

    // TODO(refactor): código duplicado detectado (bloque) con space-invaders/rendering/SpaceInvadersCanvasVisuals.ts:307-331. Considerar extraer a función compartida. Ref: 0328253c
    const size = render.size || 80;
    const boss = world.getComponent(entity, "Boss");
    const health = world.getComponent(entity, "Health");

    const currentHp = health ? health.current : (boss ? boss.hp : 50);
    const maxHp = health ? health.max : (boss ? boss.maxHp : 50);
    const hpRatio = calculateShieldHpRatio(currentHp, maxHp);

    const { phase, baseColor, accentColor } = calculateBossPhase(hpRatio);

    const flash = applyHitFlash(render, baseColor, render.opacity ?? 1.0);
    const colorStr = flash.color;
    const opacity = flash.opacity;

    canvas.save();

    const tick = world.tick;
    const s = size / 20;

    const paint = getPaint();
    paint.reset();
    paint.setAntiAlias(true);
    paint.setStyle(Skia.PaintStyle.Fill);
    paint.setColor(Skia.Color(colorStr));
    paint.setAlphaf(opacity);

    // Hull Path
    const hull = Skia.Path.Make();
    hull.moveTo(0, -s * 8);
    hull.lineTo(s * 4, -s * 4);
    hull.lineTo(s * 10, -s * 2);
    hull.lineTo(s * 9, s * 4);
    hull.lineTo(s * 6, s * 8);
    hull.lineTo(s * 3, s * 6);
    hull.lineTo(0, s * 7);
    hull.lineTo(-s * 3, s * 6);
    hull.lineTo(-s * 6, s * 8);
    hull.lineTo(-s * 9, s * 4);
    hull.lineTo(-s * 10, -s * 2);
    hull.lineTo(-s * 4, -s * 4);
    hull.close();

    canvas.drawPath(hull, paint);

    // Cannons
    paint.setStyle(Skia.PaintStyle.Stroke);
    paint.setColor(Skia.Color(accentColor));
    paint.setStrokeWidth(2.5);
    canvas.drawLine(-s * 8, -s * 2, -s * 8, -s * 6, paint);
    canvas.drawLine(s * 8, -s * 2, s * 8, -s * 6, paint);

    // Core
    const pulseSpeed = phase === 3 ? 0.3 : phase === 2 ? 0.15 : 0.08;
    const corePulse = 0.5 + 0.5 * Math.sin(tick * pulseSpeed);
    const coreRadius = s * (3.5 + 1.2 * corePulse);

    paint.setStyle(Skia.PaintStyle.Fill);
    paint.setColor(Skia.Color(phase === 3 ? colors.white : accentColor));
    canvas.drawCircle(0, 0, coreRadius, paint);

    // Cracks
    if (hpRatio < 1.0) {
      paint.setStyle(Skia.PaintStyle.Stroke);
      paint.setColor(Skia.Color("rgba(0,0,0,0.85)"));
      paint.setStrokeWidth(2);
      canvas.drawLine(-s * 6, -s * 2, s * 2, s * 4, paint);

      if (phase === 3) {
        canvas.drawLine(s * 5, -s * 3, -s * 3, s * 5, paint);
      }
    }

    canvas.restore();
  }
};

/**
 * Visuals for shield blocks using React Native Skia.
 * Layered high-tech structures, cracks, etc.
 */
// TODO(refactor): código duplicado detectado (bloque) con space-invaders/rendering/SpaceInvadersSkiaVisuals.ts:31-38. Considerar extraer a función compartida. Ref: 6a49b701
export const drawSkiaSpaceInvadersShield: ShapeDrawer<any, SpaceInvadersComponentRegistry> = {
  draw(canvas, world, entity) {
    if (!Skia) return;
    const render = world.getComponent(entity, "Render") as RenderComponent | undefined;
    if (!render) return;

    const size = render.size || 15;
    const flash = applyHitFlash(render, render.color || colors.green, render.opacity ?? 1.0);
    const colorStr = flash.color;
    // TODO(refactor): código duplicado detectado (bloque) con space-invaders/rendering/SpaceInvadersCanvasVisuals.ts:433-438. Considerar extraer a función compartida. Ref: a85d2ee2
    const opacity = flash.opacity;

    const shield = world.getComponent(entity, "Shield");
    const hp = shield ? shield.hp : 3;
    const maxHp = shield ? shield.maxHp : 3;
    const ratio = calculateShieldHpRatio(hp, maxHp);

    canvas.save();

    const paint = getPaint();
    paint.reset();
    paint.setAntiAlias(true);

    // Draw glowing semi-transparent high-tech energy cell fill
    paint.setStyle(Skia.PaintStyle.Fill);
    paint.setColor(Skia.Color(colorStr));
    paint.setAlphaf(opacity * (0.15 + 0.5 * ratio));
    canvas.drawRect(Skia.XYWHRect(-size / 2, -size / 2, size, size), paint);

    // Draw glowing contours
    paint.setStyle(Skia.PaintStyle.Stroke);
    paint.setStrokeWidth(1.5);
    paint.setAlphaf(opacity * (0.3 + 0.7 * ratio));
    canvas.drawRect(Skia.XYWHRect(-size / 2, -size / 2, size, size), paint);

    // Draw cracks
    if (ratio < 1.0) {
      paint.setColor(Skia.Color("rgba(0,0,0,0.85)"));
      paint.setStrokeWidth(1.5);
      paint.setAlphaf(opacity);

      // Fetch or store deterministic crack coordinates based on entity ID
      let coords = cachedShieldCracks.get(render);
      if (!coords) {
        const x1 = -size / 2 + ((entity * 17) % size);
        const y1 = -size / 2;
        const x2 = size / 2 - ((entity * 41) % size);
        const y2 = size / 2;
        const x3 = size / 2;
        const y3 = -size / 2 + ((entity * 97) % size);
        const x4 = -size / 2;
        const y4 = size / 2 - ((entity * 97) % size);

        coords = { x1, y1, x2, y2, x3, y3, x4, y4 };
        cachedShieldCracks.set(render, coords);
      }

      canvas.drawLine(coords.x1, coords.y1, coords.x2, coords.y2, paint);

      if (ratio < 0.4) {
        canvas.drawLine(coords.x3, coords.y3, coords.x4, coords.y4, paint);
      }
    }

    canvas.restore();
  }
};

/**
 * Visuals for particles using React Native Skia.
 * Zero-allocation heat-dissipation color shifting and scaling.
 */
export const drawSkiaSpaceInvadersParticle: ShapeDrawer<any, SpaceInvadersComponentRegistry> = {
  draw(canvas, world, entity) {
    if (!Skia) return;
    const render = world.getComponent(entity, "Render") as RenderComponent | undefined;
    if (!render) return;

    const size = render.size || 2;
    // TODO(refactor): código duplicado detectado (bloque) con space-invaders/rendering/SpaceInvadersCanvasVisuals.ts:485-496. Considerar extraer a función compartida. Ref: 10ae45f2
    const colorStr = render.color || colors.white;

    const ttl = world.getComponent(entity, "TTL");
    let progress = 0.5;

    if (ttl && ttl.remaining !== undefined) {
      const totalLife = ttl.timeLeft || 0.5;
      progress = Math.max(0, Math.min(1.0, 1.0 - (ttl.remaining / totalLife)));
    }

    // Zero-allocation heat-dissipation color shifting
    let particleColor = colorStr;
    // TODO(refactor): código duplicado detectado (bloque) con space-invaders/rendering/SpaceInvadersCanvasVisuals.ts:497-510. Considerar extraer a función compartida. Ref: 2c9a8f76
    if (colorStr === "white" || colorStr === colors.white) {
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

    const currentSize = Math.max(0.5, size * (1.1 - progress));

    canvas.save();

    const paint = getPaint();
    paint.reset();
    paint.setAntiAlias(true);
    paint.setStyle(Skia.PaintStyle.Fill);
    paint.setColor(Skia.Color(particleColor));
    paint.setAlphaf(1.0 - progress);

    canvas.drawCircle(0, 0, currentSize / 2, paint);

    canvas.restore();
  }
};
