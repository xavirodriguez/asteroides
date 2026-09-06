import { System, World, ShapeDrawer } from "@tiny-aster/core";
import { ComboComponent } from "@tiny-aster/core";
import { SpaceInvadersComponentRegistry } from "../types/SpaceInvadersTypes";

// ============================================================================
// VISUAL-ONLY SHARD PARTICLE POOL (OUTSIDE ECS)
// ============================================================================

export interface ShardParticle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  vRot: number;
  life: number;
  maxLife: number;
  color: string;
}

const SHARD_POOL_SIZE = 120;
export const SHARD_PARTICLE_POOL: ShardParticle[] = Array.from({ length: SHARD_POOL_SIZE }, () => ({
  active: false,
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  size: 0,
  rotation: 0,
  vRot: 0,
  life: 0,
  maxLife: 0,
  color: "#00FFFF"
}));

export function spawnGlassShatter(centerX: number, centerY: number, renderRandom?: any): void {
  const shardColors = ["#00FFFF", "#FFFFFF", "#88FFFF", "#0088FF"];
  const shardCount = 30;

  const nextRand = (): number => {
    if (renderRandom && typeof renderRandom.next === "function") {
      return renderRandom.next();
    }
    return 0.5;
  };

  for (let i = 0; i < shardCount; i++) {
    for (let j = 0; j < SHARD_PARTICLE_POOL.length; j++) {
      const p = SHARD_PARTICLE_POOL[j];
      if (!p.active) {
        const r1 = nextRand();
        const r2 = nextRand();
        const r3 = nextRand();
        const r4 = nextRand();
        const r5 = nextRand();

        const angle = (Math.PI * 2 * i) / shardCount + (r1 - 0.5) * 0.5;
        const speed = 120 + r2 * 260;
        p.active = true;
        p.x = centerX + (r3 - 0.5) * 60;
        p.y = centerY + (r4 - 0.5) * 30;
        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed - 50; // initial upward burst
        p.size = 3 + r5 * 8;
        p.rotation = r1 * Math.PI * 2;
        p.vRot = (r2 - 0.5) * 12;
        p.maxLife = 0.5 + r3 * 0.4;
        p.life = p.maxLife;
        p.color = shardColors[Math.floor(r4 * shardColors.length)];
        break;
      }
    }
  }
}

export function updateShardParticles(dt: number): void {
  const gravity = 400;
  for (let i = 0; i < SHARD_PARTICLE_POOL.length; i++) {
    // TODO(refactor): código duplicado detectado (bloque) con flappybird/rendering/FlappyBirdCanvasVisuals.ts:100-109. Considerar extraer a función compartida. Ref: 434358f5
    const p = SHARD_PARTICLE_POOL[i];
    if (p.active) {
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += gravity * dt; // Gravity effect on glass shards
      p.rotation += p.vRot * dt;
    }
  }
}

// ============================================================================
// CANVAS DRAWER FOR GLASS SHARDS & COMBO HUD
// ============================================================================

export function drawShardParticlesCanvas(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  for (let i = 0; i < SHARD_PARTICLE_POOL.length; i++) {
    const p = SHARD_PARTICLE_POOL[i];
    if (!p.active) continue;

    const alpha = Math.max(0, p.life / p.maxLife);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 1;

    // Draw sharp glass shard triangle
    ctx.beginPath();
    ctx.moveTo(0, -p.size);
    ctx.lineTo(p.size * 0.6, p.size * 0.8);
    ctx.lineTo(-p.size * 0.6, p.size * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }
  ctx.restore();
}

/**
 * System that monitors `Combo` component state and manages presentation & shatter effects.
 *
 * Strictly read-only on `Combo` component to avoid mutating world state in presentation phase.
 */
export class ComboHUDRenderSystem extends System<SpaceInvadersComponentRegistry> {
  private prevTimerRemaining = 0;
  private prevCombo = 0;

  public update(world: World<SpaceInvadersComponentRegistry>, deltaTime: number): void {
    // 1. Update visual particles
    updateShardParticles(deltaTime);

    // 2. Read Combo singleton / entity safely without mutation
    const comboEntities = world.query("Combo");
    const comboEntity = comboEntities.length > 0 ? comboEntities[0] : undefined;
    const comboComp = comboEntity !== undefined
      ? world.getComponent(comboEntity, "Combo")
      : undefined;

    const currentTimer = comboComp?.timerRemaining ?? 0;
    const currentCombo = comboComp?.combo ?? 0;

    // Detect expiration transition (timerRemaining > 0 -> 0) when an active combo broke
    if (this.prevTimerRemaining > 0 && currentTimer <= 0 && this.prevCombo > 1) {
      // Glass shatter effect centered around top-right HUD area (x: 700, y: 70)
      spawnGlassShatter(700, 70, world.renderRandom);
    }

    this.prevTimerRemaining = currentTimer;
    this.prevCombo = currentCombo;
  }
}

/**
 * Canvas ShapeDrawer for Combo HUD overlaid in Space Invaders screen.
 */
export const drawSpaceInvadersComboHUD: ShapeDrawer<CanvasRenderingContext2D, SpaceInvadersComponentRegistry> = {
  draw(ctx, world) {
    const comboEntities = world.query("Combo");
    if (comboEntities.length === 0) return;

    const comboComp = world.getComponent(comboEntities[0], "Combo");
    if (!comboComp || comboComp.combo <= 0 || comboComp.timerRemaining <= 0) {
      // Still draw any active glass shatter particles even if combo is 0
      drawShardParticlesCanvas(ctx);
      return;
    }

    const { combo, multiplier, timerRemaining, timerDuration } = comboComp;
    const duration = timerDuration > 0 ? timerDuration : 2.0;
    const timerRatio = Math.max(0, Math.min(1, timerRemaining / duration));

    const hudX = 700;
    const hudY = 70;

    ctx.save();

    // Scale effect based on combo count
    const scale = 1.0 + Math.min(0.5, (combo - 1) * 0.05);

    // Pulse opacity based on timerRemaining
    const pulseOpacity = 0.7 + 0.3 * Math.sin(world.tick * 0.2);

    ctx.translate(hudX, hudY);
    ctx.scale(scale, scale);
    ctx.globalAlpha = pulseOpacity;

    // Draw Multiplier Text
    ctx.fillStyle = multiplier >= 5 ? "#FFD700" : multiplier >= 3 ? "#FF00FF" : "#00FFFF";
    ctx.font = "bold 28px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 10;
    ctx.fillText(`${multiplier}x MULTIPLIER`, 0, 0);

    // Draw Combo count subtitle
    ctx.font = "bold 14px sans-serif";
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(`${combo} COMBO`, 0, 22);

    // Draw Timer Bar
    const barWidth = 100;
    const barHeight = 4;
    ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
    ctx.fillRect(-barWidth / 2, 34, barWidth, barHeight);

    ctx.fillStyle = ctx.shadowColor;
    ctx.fillRect(-barWidth / 2, 34, barWidth * timerRatio, barHeight);

    ctx.restore();

    // Draw active glass shatter particles
    drawShardParticlesCanvas(ctx);
  }
};
