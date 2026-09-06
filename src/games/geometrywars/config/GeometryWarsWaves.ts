import { WaveDefinition } from "@tiny-aster/gameplay-kit";

/**
 * Generates deterministic wave definitions for Geometry Wars.
 *
 * Wave 1: Line pattern of 5 seekers at the top of the screen.
 * Wave 2: Ring/Circle pattern of 8 enemies (4 seekers, 4 evaders) around the screen center.
 * Wave 3: Spiral pattern of 10 fast seekers spawning sequentially from the center outwards.
 *
 * @public
 */
export function generateGeometryWarsWaves(width: number = 800, height: number = 600): WaveDefinition[] {
  const centerX = width / 2;
  const centerY = height / 2;

  const waves: WaveDefinition[] = [
    // Wave 1: Line Pattern
    {
      id: "wave_1",
      cooldown: 5.0,
      spawns: Array.from({ length: 5 }, (_, i) => {
        // Space 5 seeker enemies evenly from X = 150 to X = 650, at Y = 80
        const x = 150 + i * (500 / 4);
        const y = 80;
        return {
          blueprintId: "seeker",
          args: { x, y },
          delay: 0.0,
        };
      }),
    },
    // Wave 2: Ring Pattern
    {
      id: "wave_2",
      cooldown: 5.0,
      spawns: Array.from({ length: 8 }, (_, i) => {
        // Place 8 enemies in a circle of radius 200 around the center
        const angle = (i * Math.PI * 2) / 8;
        const radius = 200;
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;

        // Alternate seeker and evader blueprints
        const blueprintId = i % 2 === 0 ? "seeker" : "evader";

        return {
          blueprintId,
          args: { x, y },
          delay: 0.0,
        };
      }),
    },
    // Wave 3: Spiral Pattern
    {
      id: "wave_3",
      cooldown: 6.0,
      spawns: Array.from({ length: 10 }, (_, i) => {
        // Place 10 fast seekers along a spiral starting from the center
        const angle = i * 1.0; // incrementing angle
        const radius = 50 + i * 20; // expanding radius
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;

        // Sequential delay of 0.2 seconds per spawn
        const delay = i * 0.2;

        return {
          blueprintId: "fast_seeker",
          args: { x, y },
          delay,
        };
      }),
    },
  ];

  return waves;
}
