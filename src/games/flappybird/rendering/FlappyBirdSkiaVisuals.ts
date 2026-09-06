import { ShapeDrawer, EffectDrawer, TransformComponent } from "@tiny-aster/core";
import { FLAPPY_CONFIG, FlappyBirdComponentRegistry } from "../types/FlappyBirdTypes";
import { computeFlappyThrusterFlame } from "../../shared/rendering/ProceduralShapeUtils";
import {
  StarfieldStar,
  generateStarfield,
  calculateSquashAndStretch,
  calculateFlappyPipeGeometry
} from "../../shared/rendering/geometry";
import {
  calculateWarpFactor,
  calculateMegastructureData,
  calculateGroundHazardFlicker,
  BACKGROUND_NEBULAE,
  MegastructureData
} from "./FlappyBirdBackgroundData";

// DUP-04: duplicación intencional de dibujadores visuales entre Canvas2D y Skia.
// Solo se extrajeron los cálculos puros a src/games/shared/rendering/geometry.ts. Ver docs/tech-debt/duplication.md

import { Skia, getPaint } from "../../shared/rendering/SkiaContext";

// Zero-allocation shader cache for React Native Skia bridge
const skiaShaderCache = new Map<string, any>();
let staticStars: any[] | null = null;

function getCachedSkiaShader(key: string, factory: () => any): any {
  let shader = skiaShaderCache.get(key);
  if (!shader) {
    if (skiaShaderCache.size > 40) {
      skiaShaderCache.clear();
    }
    shader = factory();
    skiaShaderCache.set(key, shader);
  }
  return shader;
}

// ============================================================================
// ZERO-ALLOCATION PRE-ALLOCATED VISUAL PARTICLE POOL (NEON VOID SPARKS & SHARDS)
// ============================================================================

// TODO(refactor): código duplicado detectado (clase) con flappybird/rendering/FlappyBirdCanvasVisuals.ts:31-116. Considerar extraer a función compartida. Ref: 2c8ae715
interface VisualParticle {
  active: boolean;
  type: "spark" | "shard" | "star";
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  angle: number;
  angularVelocity: number;
}

const PARTICLE_POOL_SIZE = 150;
const PARTICLE_POOL: VisualParticle[] = Array.from({ length: PARTICLE_POOL_SIZE }, () => ({
  active: false,
  type: "spark",
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  life: 0,
  maxLife: 0,
  size: 0,
  color: "",
  angle: 0,
  angularVelocity: 0,
}));

export function spawnVisualParticle(
  type: "spark" | "shard" | "star",
  x: number,
  y: number,
  vx: number,
  vy: number,
  maxLife: number,
  size: number,
  color: string,
  angle = 0,
  angularVelocity = 0
): void {
  for (let i = 0; i < PARTICLE_POOL.length; i++) {
    const p = PARTICLE_POOL[i];
    if (!p.active) {
      p.active = true;
      p.type = type;
      p.x = x;
      p.y = y;
      p.vx = vx;
      p.vy = vy;
      p.life = maxLife;
      p.maxLife = maxLife;
      p.size = size;
      p.color = color;
      p.angle = angle;
      p.angularVelocity = angularVelocity;
      break;
    }
  }
}

function updateVisualParticles(): void {
  const dt = 0.016; // Stable target 60FPS tick
  for (let i = 0; i < PARTICLE_POOL.length; i++) {
    const p = PARTICLE_POOL[i];
    if (p.active) {
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.angle += p.angularVelocity * dt;

      if (p.type === "spark") {
        p.vx *= 0.96;
        p.vy *= 0.96;
      } else if (p.type === "shard") {
        p.vy += 45 * dt; // Gravity drop on hull debris
      }
    }
  }
}

let diamondSparkPath: any = null;
function getDiamondSparkPath(): any {
  if (!diamondSparkPath && Skia) {
    diamondSparkPath = Skia.Path.Make();
    diamondSparkPath.moveTo(2.5, 0);
    diamondSparkPath.lineTo(0, -0.6);
    diamondSparkPath.lineTo(-2.5, 0);
    diamondSparkPath.lineTo(0, 0.6);
    diamondSparkPath.close();
  }
  return diamondSparkPath;
}

let shardPolyPath: any = null;
function getShardPolyPath(): any {
  if (!shardPolyPath && Skia) {
    shardPolyPath = Skia.Path.Make();
    shardPolyPath.moveTo(1.2, -0.8);
    shardPolyPath.lineTo(0.4, 1.1);
    shardPolyPath.lineTo(-1.1, 0.3);
    shardPolyPath.lineTo(-0.6, -1.0);
    shardPolyPath.close();
  }
  return shardPolyPath;
}

function drawSkiaVisualParticles(canvas: any, paint: any): void {
  for (let i = 0; i < PARTICLE_POOL.length; i++) {
    const p = PARTICLE_POOL[i];
    if (!p.active) continue;

    const ratio = p.life / p.maxLife;
    canvas.save();
    canvas.translate(p.x, p.y);
    canvas.rotate((p.angle * 180) / Math.PI, 0, 0);

    paint.reset();
    paint.setAntiAlias(true);
    paint.setAlphaf(ratio);

    if (p.type === "spark") {
      paint.setStyle(Skia.PaintStyle.Fill);
      paint.setColor(Skia.Color(p.color));
      const sparkPath = getDiamondSparkPath();
      if (sparkPath) {
        canvas.save();
        canvas.scale(p.size, p.size);
        canvas.drawPath(sparkPath, paint);
        canvas.restore();
      }
    } else if (p.type === "shard") {
      // Titanium hull fragment with red-hot edge
      paint.setStyle(Skia.PaintStyle.Fill);
      paint.setColor(Skia.Color("#5A6173")); // Titanium hull color
      const shardPath = getShardPolyPath();
      if (shardPath) {
        canvas.save();
        canvas.scale(p.size, p.size);
        canvas.drawPath(shardPath, paint);

        // Red-hot glowing edge
        paint.setStyle(Skia.PaintStyle.Stroke);
        paint.setColor(Skia.Color("#FF3300"));
        paint.setStrokeWidth(0.6);
        canvas.drawPath(shardPath, paint);
        canvas.restore();
      }
    } else if (p.type === "star") {
      paint.setStyle(Skia.PaintStyle.Fill);
      paint.setColor(Skia.Color(p.color));
      canvas.drawRect(Skia.XYWHRect(-p.size / 2, -p.size / 2, p.size, p.size), paint);
    }

    canvas.restore();
  }
}

// ============================================================================
// PLAYER SHIP ("INTERCEPTOR") RENDERING WITH TITANIUM HULL & CYAN COCKPIT
// ============================================================================

interface InterceptorRenderState {
  lastVy: number;
  lastIsAlive: boolean;
  lastNearMissTimer: number;
}

const shipStates = new Map<number, InterceptorRenderState>();

let cachedArrowheadPath: any = null;
function getArrowheadPath(size: number): any {
  if (!cachedArrowheadPath && Skia) {
    cachedArrowheadPath = Skia.Path.Make();
    cachedArrowheadPath.moveTo(size * 1.2, 0);
    cachedArrowheadPath.lineTo(-size * 0.7, -size * 0.85);
    cachedArrowheadPath.lineTo(-size * 0.4, -size * 0.35);
    cachedArrowheadPath.lineTo(-size * 0.55, 0);
    cachedArrowheadPath.lineTo(-size * 0.4, size * 0.35);
    cachedArrowheadPath.lineTo(-size * 0.7, size * 0.85);
    cachedArrowheadPath.close();
  }
  return cachedArrowheadPath;
}

export const drawSkiaFlappyBird: ShapeDrawer<any, FlappyBirdComponentRegistry> = {
  draw(canvas, world, entity) {
    if (!Skia) return;
    // TODO(refactor): código duplicado detectado (bloque) con flappybird/rendering/FlappyBirdCanvasVisuals.ts:194-202. Considerar extraer a función compartida. Ref: 99824503
    const render = world.getComponent(entity, "Render");
    if (!render) return;

    const { size = 15 } = render;
    const transform = world.getComponent(entity, "Transform") as TransformComponent;
    const birdComp = world.getComponent(entity, "Bird");
    if (!transform || !birdComp) return;

    const health = world.getComponent(entity, "Health");
    const x = transform.worldX ?? transform.x;
    // TODO(refactor): código duplicado detectado (bloque) con flappybird/rendering/FlappyBirdCanvasVisuals.ts:202-221. Considerar extraer a función compartida. Ref: 0d24f7f4
    const y = transform.worldY ?? transform.y;

    let state = shipStates.get(entity);
    if (!state) {
      state = {
        lastVy: 0,
        lastIsAlive: birdComp.isAlive,
        lastNearMissTimer: birdComp.nearMissTimer,
      };
      shipStates.set(entity, state);
    }

    const vy = birdComp.velocityY;
    const isAlive = birdComp.isAlive;

    // --- TRIGGER NEAR-MISS CYAN SPARKS ---
    const hasNearMissTriggered = birdComp.nearMissTimer > 0 && state.lastNearMissTimer <= 0;
    if (hasNearMissTriggered && isAlive) {
      const transformPos = world.getComponent(entity, "Transform") as TransformComponent;
      const px = transformPos.worldX ?? transformPos.x ?? x;
      const py = transformPos.worldY ?? transformPos.y ?? y;
      const nmSparkCount = world.renderRandom.nextInt(5, 9);
      for (let i = 0; i < nmSparkCount; i++) {
        const angleVal = world.renderRandom.next() * Math.PI * 2;
        const speedVal = world.renderRandom.nextRange(60, 120);
        const pVx = Math.cos(angleVal) * speedVal;
        const pVy = Math.sin(angleVal) * speedVal;
        const lifeVal = world.renderRandom.nextRange(0.25, 0.45);
        const sizeVal = world.renderRandom.nextRange(2, 4);
        spawnVisualParticle("spark", px, py, pVx, pVy, lifeVal, sizeVal, "#00F3FF", angleVal);
      }
    }

    // --- TRIGGER SPARKS ON BOOST THRUST ---
    const flapStrength = FLAPPY_CONFIG.FLAP_STRENGTH;
    const hasFlapped = (vy < -150 && state.lastVy >= -150) || (vy === flapStrength && state.lastVy !== flapStrength);
    if (hasFlapped && isAlive) {
      // TODO(refactor): código duplicado detectado (bloque) con flappybird/rendering/FlappyBirdCanvasVisuals.ts:224-240. Considerar extraer a función compartida. Ref: 7387d3cd
      const pCount = 4 + world.renderRandom.nextInt(0, 3);
      for (let i = 0; i < pCount; i++) {
        const angleVal = world.renderRandom.nextRange(160, 200) * (Math.PI / 180);
        const speedVal = world.renderRandom.nextRange(80, 160);
        const pVx = Math.cos(angleVal) * speedVal;
        const pVy = Math.sin(angleVal) * speedVal;
        const lifeVal = world.renderRandom.nextRange(0.2, 0.45);
        const sizeVal = world.renderRandom.nextRange(2, 4);
        const randColor = world.renderRandom.next() > 0.5 ? "#FFFFFF" : "#FFC000";
        spawnVisualParticle("spark", x - size * 0.5, y, pVx, pVy, lifeVal, sizeVal, randColor, angleVal);
      }
    }

    // --- TRIGGER SHARDS & SPARKS ON DEATH ---
    const hasDied = !isAlive && state.lastIsAlive;
    if (hasDied) {
      // TODO(refactor): código duplicado detectado (bloque) con flappybird/rendering/FlappyBirdCanvasVisuals.ts:243-270. Considerar extraer a función compartida. Ref: 2e7c6e07
      const sCount = 8 + world.renderRandom.nextInt(0, 4);
      for (let i = 0; i < sCount; i++) {
        const angleVal = world.renderRandom.next() * Math.PI * 2;
        const speedVal = world.renderRandom.nextRange(40, 120);
        const pVx = Math.cos(angleVal) * speedVal;
        const pVy = Math.sin(angleVal) * speedVal;
        const lifeVal = world.renderRandom.nextRange(0.6, 1.1);
        const sizeVal = world.renderRandom.nextRange(3, 6);
        spawnVisualParticle("shard", x, y, pVx, pVy, lifeVal, sizeVal, "#5A6173", angleVal, world.renderRandom.nextRange(-4, 4));
      }
      for (let i = 0; i < 12; i++) {
        const angleVal = world.renderRandom.next() * Math.PI * 2;
        const speedVal = world.renderRandom.nextRange(80, 200);
        const pVx = Math.cos(angleVal) * speedVal;
        const pVy = Math.sin(angleVal) * speedVal;
        const lifeVal = world.renderRandom.nextRange(0.25, 0.5);
        const sizeVal = world.renderRandom.nextRange(2, 5);
        spawnVisualParticle("spark", x, y, pVx, pVy, lifeVal, sizeVal, "#FF3300", angleVal);
      }
    }

    state.lastVy = vy;
    state.lastIsAlive = isAlive;
    state.lastNearMissTimer = birdComp.nearMissTimer;

    let globalOpacity = 1.0;
    if (render.hitFlashFrames && render.hitFlashFrames > 0) {
      if ((render.hitFlashFrames >> 1) % 2 === 0) {
        globalOpacity = 0.35;
      }
    }

    if (health && health.invulnerableRemaining !== undefined && health.invulnerableRemaining > 0) {
      globalOpacity = (Math.floor(health.invulnerableRemaining / 100) % 2 === 0) ? 0.35 : 1.0;
    }

    const paint = getPaint();

    canvas.save();

    // Velocity Squash-and-Stretch
    const speed = Math.abs(vy);
    const { scaleX, scaleY } = calculateSquashAndStretch(vy);
    canvas.scale(scaleX, scaleY);

    // --- CYAN LIGHT TRAIL / PARAMETERIZED COSMETIC TRAIL ---
    if (isAlive) {
      const trailConfig = world.getResource<{ enabled?: boolean; color?: string; width?: number; lengthMultiplier?: number }>("CosmeticTrailConfig");
      const trailColor = trailConfig?.color || "rgba(0, 243, 255, 0.35)";
      const trailWidth = trailConfig?.width || 2.0;
      const lengthMult = trailConfig?.lengthMultiplier || 1.0;

      paint.reset();
      paint.setStyle(Skia.PaintStyle.Stroke);
      paint.setColor(Skia.Color(trailColor));
      paint.setStrokeWidth(trailWidth);
      canvas.drawLine(-size * 0.55, 0, -size * (1.8 * lengthMult) - Math.min(speed * 0.1 * lengthMult, 25), 0, paint);
    }

    // --- THERMONUCLEAR REACTIVE THRUSTER FLAME ---
    if (isAlive) {
      const { flameLength, flameWidth } = computeFlappyThrusterFlame(size, vy, world.tick);

      const flameShader = getCachedSkiaShader(`flame_${size}`, () =>
        Skia.Shader.MakeLinearGradient(
          Skia.Point(-size * 0.55, 0),
          Skia.Point(-size * 2.2, 0),
          [Skia.Color("#FFFFFF"), Skia.Color("#FFC000"), Skia.Color("#FF3300")],
          [0, 0.35, 1.0],
          Skia.TileMode.Clamp
        )
      );
      paint.reset();
      paint.setStyle(Skia.PaintStyle.Fill);
      paint.setShader(flameShader);
      paint.setAlphaf(globalOpacity);

      const flamePath = Skia.Path.Make();
      flamePath.moveTo(-size * 0.55, -flameWidth * 0.5);
      flamePath.lineTo(-size * 0.55 - flameLength, 0);
      flamePath.lineTo(-size * 0.55, flameWidth * 0.5);
      flamePath.close();
      canvas.drawPath(flamePath, paint);
    }

    // --- TITANIUM HULL GRADIENT SHADER ---
    const hullShader = getCachedSkiaShader(`hull_${size}_${isAlive}`, () => {
      let hullColors = [Skia.Color("#5A6173"), Skia.Color("#8B93A5"), Skia.Color("#D3D9E2")];
      if (!isAlive) {
        hullColors = [Skia.Color("#3A3F4B"), Skia.Color("#5A6173"), Skia.Color("#696969")];
      }
      return Skia.Shader.MakeLinearGradient(
        Skia.Point(-size * 0.7, 0),
        Skia.Point(size * 1.2, 0),
        hullColors,
        [0, 0.5, 1.0],
        Skia.TileMode.Clamp
      );
    });

    paint.reset();
    paint.setAntiAlias(true);
    paint.setStyle(Skia.PaintStyle.Fill);
    paint.setShader(hullShader);
    paint.setAlphaf(globalOpacity);

    const arrowheadPath = getArrowheadPath(size);
    if (arrowheadPath) {
      canvas.drawPath(arrowheadPath, paint);

      paint.reset();
      paint.setStyle(Skia.PaintStyle.Stroke);
      paint.setColor(Skia.Color("#1A1D24"));
      paint.setStrokeWidth(1.2);
      paint.setAlphaf(globalOpacity);
      canvas.drawPath(arrowheadPath, paint);
    }

    // --- ELLIPTICAL CYAN COCKPIT ---
    paint.reset();
    paint.setStyle(Skia.PaintStyle.Fill);
    paint.setColor(Skia.Color("#00F3FF"));
    paint.setAlphaf(globalOpacity);
    canvas.drawOval(Skia.XYWHRect(-size * 0.2, -size * 0.23, size * 0.7, size * 0.36), paint);

    paint.setStyle(Skia.PaintStyle.Stroke);
    paint.setColor(Skia.Color("rgba(0, 0, 0, 0.7)"));
    paint.setStrokeWidth(0.8);
    canvas.drawOval(Skia.XYWHRect(-size * 0.2, -size * 0.23, size * 0.7, size * 0.36), paint);

    // Reflection dot
    paint.setStyle(Skia.PaintStyle.Fill);
    paint.setColor(Skia.Color("#FFFFFF"));
    canvas.drawCircle(size * 0.25, -size * 0.09, size * 0.06, paint);

    canvas.restore();
  }
};

// ============================================================================
// CONTAINMENT TOWERS (OBSTACLES) — INDUSTRIAL METALLIC PILLARS & RED BEACONS
// ============================================================================

export const drawSkiaFlappyPipe: ShapeDrawer<any, FlappyBirdComponentRegistry> = {
  draw(canvas, world, entity) {
    if (!Skia) return;
    // TODO(refactor): código duplicado detectado (bloque) con flappybird/rendering/FlappyBirdCanvasVisuals.ts:437-456. Considerar extraer a función compartida. Ref: ac6d56dd
    const render = world.getComponent(entity, "Render");
    const pos = world.getComponent(entity, "Transform");
    if (!render || !pos) return;

    const { size = 60 } = render;
    const width = size;
    const halfWidth = width / 2;

    const pipe = world.getComponent(entity, "Pipe");
    if (!pipe) return;

    const { isTopPipe, pipeY, pipeHeight, capYOffset, beaconY } = calculateFlappyPipeGeometry(
      pos.y,
      pipe.gapY,
      pipe.gapSize,
      FLAPPY_CONFIG.SCREEN_HEIGHT
    );

    const paint = getPaint();

    // Metallic Pillar Body Shader (#2A2A35)
    const pillarShader = getCachedSkiaShader(`pillar_${halfWidth}`, () =>
      Skia.Shader.MakeLinearGradient(
        Skia.Point(-halfWidth, 0),
        Skia.Point(halfWidth, 0),
        [
          Skia.Color("#1A1A22"),
          Skia.Color("#2A2A35"),
          Skia.Color("#3F3F50"),
          Skia.Color("#2A2A35"),
          Skia.Color("#121218")
        ],
        [0, 0.25, 0.5, 0.75, 1.0],
        Skia.TileMode.Clamp
      )
    );
    paint.reset();
    paint.setStyle(Skia.PaintStyle.Fill);
    paint.setShader(pillarShader);
    // TODO(refactor): código duplicado detectado (bloque) con flappybird/rendering/FlappyBirdSkiaVisuals.ts:504-510. Considerar extraer a función compartida. Ref: 84d69b61
    canvas.drawRect(Skia.XYWHRect(-halfWidth, pipeY, width, pipeHeight), paint);

    paint.reset();
    paint.setStyle(Skia.PaintStyle.Stroke);
    paint.setColor(Skia.Color("#121218"));
    paint.setStrokeWidth(1.5);
    canvas.drawRect(Skia.XYWHRect(-halfWidth, pipeY, width, pipeHeight), paint);

    // Docking Collar Cap at gap mouth
    const capHeight = 28;
    const capExtraWidth = 12;
    const capWidth = width + capExtraWidth;
    const capHalfWidth = capWidth / 2;

    const collarShader = getCachedSkiaShader(`collar_${capHalfWidth}`, () =>
      Skia.Shader.MakeLinearGradient(
        Skia.Point(-capHalfWidth, 0),
        Skia.Point(capHalfWidth, 0),
        [
          Skia.Color("#22222D"),
          Skia.Color("#3A3A4A"),
          Skia.Color("#525266"),
          Skia.Color("#3A3A4A"),
          Skia.Color("#181822")
        ],
        [0, 0.3, 0.55, 0.8, 1.0],
        Skia.TileMode.Clamp
      )
    );
    paint.reset();
    paint.setStyle(Skia.PaintStyle.Fill);
    paint.setShader(collarShader);
    // TODO(refactor): código duplicado detectado (bloque) con flappybird/rendering/FlappyBirdSkiaVisuals.ts:479-485. Considerar extraer a función compartida. Ref: 06124d5b
    canvas.drawRect(Skia.XYWHRect(-capHalfWidth, capYOffset, capWidth, capHeight), paint);

    paint.reset();
    paint.setStyle(Skia.PaintStyle.Stroke);
    paint.setColor(Skia.Color("#121218"));
    paint.setStrokeWidth(1.5);
    canvas.drawRect(Skia.XYWHRect(-capHalfWidth, capYOffset, capWidth, capHeight), paint);

    // Stroboscopic Red Warning Beacons (#FF0000) strictly bound to world.tick with soft glow halo
    const beaconPulse = 0.35 + 0.65 * Math.abs(Math.sin(world.tick * 0.2));

    const beaconHaloShader = getCachedSkiaShader(`beacon_halo_${beaconPulse.toFixed(2)}`, () =>
      Skia.Shader.MakeTwoPointConicalGradient(
        Skia.Point(0, beaconY),
        4,
        Skia.Point(0, beaconY),
        45,
        [Skia.Color("rgba(255,0,0,0.25)"), Skia.Color("rgba(255,0,0,0.08)"), Skia.Color("rgba(255,0,0,0)")],
        [0, 0.5, 1.0],
        Skia.TileMode.Clamp
      )
    );

    paint.reset();
    paint.setStyle(Skia.PaintStyle.Fill);
    paint.setShader(beaconHaloShader);
    canvas.drawCircle(0, beaconY, 45, paint);

    paint.reset();
    paint.setStyle(Skia.PaintStyle.Fill);
    paint.setColor(Skia.Color("#FF0000"));
    paint.setAlphaf(beaconPulse);
    canvas.drawCircle(-capHalfWidth + 8, beaconY, 3.5, paint);
    canvas.drawCircle(capHalfWidth - 8, beaconY, 3.5, paint);

    paint.setColor(Skia.Color("#FFFFFF"));
    paint.setAlphaf(beaconPulse);
    canvas.drawCircle(-capHalfWidth + 8, beaconY, 1.2, paint);
    canvas.drawCircle(capHalfWidth - 8, beaconY, 1.2, paint);
  }
};

// ============================================================================
// STATION HULL GROUND — INDUSTRIAL METALLIC BASE WITH CAUTION STRIPES
// ============================================================================

export const drawSkiaFlappyGround: ShapeDrawer<any, FlappyBirdComponentRegistry> = {
  draw(canvas, world, entity) {
    if (!Skia) return;
    const render = world.getComponent(entity, "Render");
    if (!render) return;

    const { size = 400 } = render;
    const width = size;
    const height = 40;

    const paint = getPaint();

    // Dark industrial metal base
    const baseShader = getCachedSkiaShader(`base_${height}`, () =>
      Skia.Shader.MakeLinearGradient(
        Skia.Point(0, -height / 2),
        Skia.Point(0, height / 2),
        [Skia.Color("#22222C"), Skia.Color("#0D0D12")],
        [0, 1.0],
        Skia.TileMode.Clamp
      )
    );
    paint.reset();
    paint.setStyle(Skia.PaintStyle.Fill);
    paint.setShader(baseShader);
    canvas.drawRect(Skia.XYWHRect(-width / 2, -height / 2, width, height), paint);

    // Yellow / Black caution stripe top rim with non-linear flickering
    const hazardFlicker = calculateGroundHazardFlicker(world.tick);

    paint.reset();
    paint.setStyle(Skia.PaintStyle.Fill);
    paint.setColor(Skia.Color("#FFCC00"));
    paint.setAlphaf(hazardFlicker);
    canvas.drawRect(Skia.XYWHRect(-width / 2, -height / 2, width, 8), paint);

    paint.setStyle(Skia.PaintStyle.Stroke);
    paint.setColor(Skia.Color("#111116"));
    paint.setAlphaf(hazardFlicker);
    paint.setStrokeWidth(4);
    const stripeOffset = (world.tick * 3) % 24;

    for (let sx = -width / 2 - 24; sx < width / 2 + 24; sx += 20) {
      canvas.drawLine(sx + stripeOffset, -height / 2, sx + stripeOffset - 10, -height / 2 + 8, paint);
    }

    paint.reset();
    paint.setStyle(Skia.PaintStyle.Stroke);
    paint.setColor(Skia.Color("#5A6173"));
    paint.setStrokeWidth(1.0);
    canvas.drawLine(-width / 2, -height / 2, width / 2, -height / 2, paint);
  }
};

// Helper to draw 4 distinct megastructure silhouette designs in Skia
function drawSkiaMegastructure(canvas: any, paint: any, data: MegastructureData): void {
  if (!Skia) return;
  const { megaIndex, megaX, megaY, beaconAlpha } = data;
  canvas.save();

  paint.reset();
  paint.setStyle(Skia.PaintStyle.Fill);
  paint.setColor(Skia.Color("rgba(15, 18, 28, 0.65)"));

  if (megaIndex === 0) {
    // Design 0: Radial Station
    canvas.drawCircle(megaX, megaY, 36, paint);
    canvas.drawRect(Skia.XYWHRect(megaX - 85, megaY - 4, 170, 8), paint);
    canvas.drawRect(Skia.XYWHRect(megaX - 4, megaY - 85, 8, 170), paint);
    canvas.drawRect(Skia.XYWHRect(megaX - 80, megaY - 25, 6, 50), paint);
    canvas.drawRect(Skia.XYWHRect(megaX + 74, megaY - 25, 6, 50), paint);

    paint.setColor(Skia.Color("#FF0000"));
    paint.setAlphaf(beaconAlpha);
    canvas.drawCircle(megaX, megaY - 85, 2.5, paint);
  } else if (megaIndex === 1) {
    // Design 1: Ship Wreckage
    const path = Skia.Path.Make();
    path.moveTo(megaX - 60, megaY - 30);
    path.lineTo(megaX + 70, megaY - 10);
    path.lineTo(megaX + 40, megaY + 35);
    path.lineTo(megaX - 50, megaY + 20);
    path.close();
    canvas.drawPath(path, paint);

    canvas.drawRect(Skia.XYWHRect(megaX - 90, megaY - 45, 12, 90), paint);
    canvas.drawRect(Skia.XYWHRect(megaX - 90, megaY - 3, 100, 6), paint);

    paint.setColor(Skia.Color("#FF0000"));
    paint.setAlphaf(beaconAlpha);
    canvas.drawCircle(megaX + 70, megaY - 10, 2.5, paint);
  } else if (megaIndex === 2) {
    // Design 2: Broken Ring
    paint.setStyle(Skia.PaintStyle.Stroke);
    paint.setStrokeWidth(14);
    const ringPath = Skia.Path.Make();
    ringPath.addArc(
      Skia.XYWHRect(megaX - 55, megaY - 55, 110, 110),
      -126,
      216
    );
    canvas.drawPath(ringPath, paint);

    paint.setStyle(Skia.PaintStyle.Fill);
    canvas.drawRect(Skia.XYWHRect(megaX - 10, megaY - 60, 20, 10), paint);
    canvas.drawRect(Skia.XYWHRect(megaX + 48, megaY - 10, 10, 20), paint);

    paint.setColor(Skia.Color("#FF0000"));
    paint.setAlphaf(beaconAlpha);
    canvas.drawCircle(megaX - 10, megaY - 60, 2.5, paint);
  } else {
    // Design 3: Communications Tower
    canvas.drawRect(Skia.XYWHRect(megaX - 6, megaY - 90, 12, 180), paint);
    canvas.drawRect(Skia.XYWHRect(megaX - 25, megaY - 40, 50, 6), paint);
    canvas.drawRect(Skia.XYWHRect(megaX - 35, megaY + 10, 70, 8), paint);

    const dishPath = Skia.Path.Make();
    dishPath.addArc(
      Skia.XYWHRect(megaX - 22, megaY - 92, 44, 44),
      36,
      108
    );
    canvas.drawPath(dishPath, paint);

    paint.setColor(Skia.Color("#FF0000"));
    paint.setAlphaf(beaconAlpha);
    canvas.drawCircle(megaX, megaY - 90, 2.5, paint);
  }

  canvas.restore();
}

// ============================================================================
// THE DEEP VOID PARALLAX BACKGROUND (#050510)
// ============================================================================

export const scrollingSkiaBackgroundEffect: EffectDrawer<any, FlappyBirdComponentRegistry> = {
  draw(canvas, world) {
    if (!Skia) return;
    const gameState = world.getSingleton("FlappyState");
    if (!gameState) return;
    const { width = 400, height = 600 } = world.getResource<{ width: number; height: number }>("ScreenConfig") || { width: 400, height: 600 };

    const paint = getPaint();

    updateVisualParticles();

    // Deep Void Space Base (#050510)
    paint.reset();
    paint.setStyle(Skia.PaintStyle.Fill);
    paint.setColor(Skia.Color("#050510"));
    // TODO(refactor): código duplicado detectado (bloque) con flappybird/rendering/FlappyBirdCanvasVisuals.ts:645-655. Considerar extraer a función compartida. Ref: e7c4cf1f
    canvas.drawRect(Skia.XYWHRect(0, 0, width, height), paint);

    // --- ANIMATED LOW-OPACITY RADIAL NEBULAE CLOUDS ---
    for (let n = 0; n < BACKGROUND_NEBULAE.length; n++) {
      const neb = BACKGROUND_NEBULAE[n];
      const nx = width * neb.xRatio + Math.sin(world.tick * 0.01 + n) * 15;
      const ny = height * neb.yRatio + Math.cos(world.tick * 0.008 + n * 2) * 10;
      const nebShader = getCachedSkiaShader(`neb_${n}_${width}_${height}`, () =>
        Skia.Shader.MakeTwoPointConicalGradient(
          Skia.Point(nx, ny),
          10,
          Skia.Point(nx, ny),
          neb.radius,
          [Skia.Color(neb.colorHex), Skia.Color(neb.colorHex), Skia.Color("#050510")],
          [0, 0.6, 1.0],
          Skia.TileMode.Clamp
        )
      );
      if (nebShader) {
        paint.reset();
        paint.setStyle(Skia.PaintStyle.Fill);
        paint.setShader(nebShader);
        paint.setAlphaf(0.35);
        canvas.drawRect(Skia.XYWHRect(0, 0, width, height), paint);
      }
    }

    // --- SPORADIC DISTANT BACKGROUND DEBRIS / SPARKS ---
    // Deterministically spawn faint distant sparks/shards approx every 4-8 seconds (240-480 ticks)
    if (world.tick % 300 === 0 && world.renderRandom.next() > 0.3) {
      const dx = world.renderRandom.nextRange(20, width - 20);
      const dy = world.renderRandom.nextRange(40, height * 0.7);
      const angle = world.renderRandom.next() * Math.PI * 2;
      const speed = world.renderRandom.nextRange(15, 35);
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      spawnVisualParticle("star", dx, dy, vx, vy, world.renderRandom.nextRange(1.0, 2.0), world.renderRandom.nextRange(1.5, 3.0), "#5A6173", angle);
    }

    // Hypervelocity combo factor calculation
    let warpFactor = 1.0;
    const comboEntities = world.query("Combo");
    if (comboEntities.length > 0) {
      const combo = world.getComponent(comboEntities[0], "Combo") as any;
      if (combo && combo.multiplier > 1) {
        warpFactor = 1.0 + (combo.multiplier - 1) * 0.35;
      }
    }

    if (!staticStars) {
      staticStars = generateStarfield(width, height);
    }

    const tick = world.tick;
    paint.reset();
    paint.setStyle(Skia.PaintStyle.Fill);

    for (let i = 0; i < staticStars.length; i++) {
      const star = staticStars[i];
      let speed = star.layer === 2 ? 0.08 : star.layer === 0 ? 0.2 : 0.8 * warpFactor;
      let sx = (star.x - tick * speed) % width;
      if (sx < 0) sx += width;

      paint.setAlphaf(star.alpha);
      if (star.layer === 2) {
        paint.setColor(Skia.Color("#5A6173"));
        canvas.drawRect(Skia.XYWHRect(sx, star.y, star.size, star.size), paint);
      } else if (star.layer === 0) {
        paint.setColor(Skia.Color("#FFFFFF"));
        canvas.drawRect(Skia.XYWHRect(sx, star.y, star.size, star.size), paint);
      } else {
        paint.setColor(Skia.Color("#E0E5FF"));
        const pLen = warpFactor > 1.2 ? Math.min(star.size * 3 * warpFactor, 10) : star.size;
        canvas.drawRect(Skia.XYWHRect(sx, star.y, pLen, star.size), paint);
      }
    }

    // --- AD-HOC RADIAL WARP SPEED LINES (WARPFACTOR > 1.5) ---
    // Opting for an ad-hoc local implementation instead of registering global SharedVFX
    // to preserve zero side-effects on shared VFX state across other minigames (e.g. Geometry Wars)
    // while pinning radial speed lines strictly to Flappy Bird's viewport center and combo factor.
    if (warpFactor > 1.5) {
      const cx = width / 2;
      const cy = height / 2;
      const lineCount = 20;
      const maxR = Math.sqrt(cx * cx + cy * cy);
      const intensity = Math.min((warpFactor - 1.5) / 1.5, 1.0);

      canvas.save();
      paint.reset();
      paint.setStyle(Skia.PaintStyle.Stroke);
      paint.setColor(Skia.Color("#00F3FF"));
      paint.setAlphaf(0.15 * intensity);
      paint.setStrokeWidth(1.2);

      for (let l = 0; l < lineCount; l++) {
        const angle = (l / lineCount) * Math.PI * 2 + (tick * 0.02);
        const innerR = 40 + (l * 17 + tick * 8) % (maxR * 0.5);
        const outerR = innerR + 40 * warpFactor;
        canvas.drawLine(
          cx + Math.cos(angle) * innerR,
          cy + Math.sin(angle) * innerR,
          cx + Math.cos(angle) * outerR,
          cy + Math.sin(angle) * outerR,
          paint
        );
      }
      canvas.restore();
    }

    // --- OCCASIONAL ISOLATED ABANDONED MEGASTRUCTURE SILHOUETTE ---
    const megaData = calculateMegastructureData(tick, width, height);
    if (megaData.visible) {
      drawSkiaMegastructure(canvas, paint, megaData);
    }

    // Draw active sparks & shards
    drawSkiaVisualParticles(canvas, paint);

    // CRT Scanlines Overlay
    paint.reset();
    paint.setColor(Skia.Color("rgba(0, 0, 0, 0.06)"));
    for (let ly = 0; ly < height; ly += 3) {
      canvas.drawRect(Skia.XYWHRect(0, ly, width, 1), paint);
    }

    // Edge Vignette Overlay
    const vignShader = getCachedSkiaShader(`vign_${width}_${height}`, () =>
      Skia.Shader.MakeTwoPointConicalGradient(
        Skia.Point(width / 2, height / 2),
        width * 0.4,
        Skia.Point(width / 2, height / 2),
        width * 0.8,
        [Skia.Color("rgba(0,0,0,0)"), Skia.Color("rgba(0,0,0,0.45)")],
        [0, 1.0],
        Skia.TileMode.Clamp
      )
    );
    if (vignShader) {
      paint.reset();
      paint.setStyle(Skia.PaintStyle.Fill);
      paint.setShader(vignShader);
      canvas.drawRect(Skia.XYWHRect(0, 0, width, height), paint);
    }
  },
};
