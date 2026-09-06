import { World } from "@tiny-aster/core";

/**
 * Shared data structures and pure calculations for Flappy Bird background rendering across Canvas and Skia.
 */

export interface MegastructureData {
  visible: boolean;
  megaIndex: number;
  megaX: number;
  megaY: number;
  beaconAlpha: number;
}

/**
 * Calculates warp factor based on combo multiplier in world.
 */
export function calculateWarpFactor(world: World<any>): number {
  const comboEntities = world.query("Combo");
  if (comboEntities.length > 0) {
    const combo = world.getComponent(comboEntities[0], "Combo") as any;
    if (combo && combo.multiplier > 1) {
      return 1.0 + (combo.multiplier - 1) * 0.35;
    }
  }
  return 1.0;
}

/**
 * Calculates megastructure visibility, index (0..3 for 4 designs), position, and beacon pulse.
 */
export function calculateMegastructureData(
  tick: number,
  width: number,
  height: number,
  cycle = 1600
): MegastructureData {
  const megaProgress = (tick % cycle) / cycle;
  const megaIndex = Math.floor(tick / cycle) % 4;

  if (megaProgress < 0.6) {
    const megaX = width - (megaProgress / 0.6) * (width + 250);
    const megaY = height * 0.35;
    const beaconAlpha = 0.2 + 0.3 * Math.sin(tick * 0.05);
    return { visible: true, megaIndex, megaX, megaY, beaconAlpha };
  }
  return { visible: false, megaIndex: 0, megaX: 0, megaY: 0, beaconAlpha: 0 };
}

/**
 * Calculates non-linear flickering intensity for hazard stripes on station ground.
 */
export function calculateGroundHazardFlicker(tick: number): number {
  const val = 0.75 + 0.25 * Math.sin(tick * 0.1) * Math.cos(tick * 0.23 + 1.2) + 0.1 * Math.sin(tick * 0.07);
  return Math.max(0.3, Math.min(1.0, val));
}

/**
 * Nebulae configuration parameters.
 */
export interface NebulaData {
  xRatio: number;
  yRatio: number;
  radius: number;
  colorHex: string;
}

export const BACKGROUND_NEBULAE: NebulaData[] = [
  { xRatio: 0.25, yRatio: 0.3, radius: 180, colorHex: "#2A0044" }, // Deep dark violet
  { xRatio: 0.75, yRatio: 0.65, radius: 210, colorHex: "#002838" }, // Low-opacity dark cyan
  { xRatio: 0.5, yRatio: 0.45, radius: 150, colorHex: "#1C0033" }, // Faint indigo core
];
