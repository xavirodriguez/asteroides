# Guía para la Configuración de Juegos en ArcadeGames

Esta guía documenta el patrón unificado **Zod + ConfigService** utilizado para configurar los minijuegos de ArcadeGames.

## Visión General

Todos los minijuegos extienden sus configuraciones a partir de `BaseConfigSchema` y combinan formas (shapes) de Zod reutilizables definidas en `@tiny-aster/gameplay-kit`.

## Shapes Reutilizables Disponibles

- **`ScreenDimensionsSchema`**: `SCREEN_WIDTH` (default 800), `SCREEN_HEIGHT` (default 600), `SCREEN_CENTER_X`, `SCREEN_CENTER_Y`.
- **`ComboConfigSchema`**: `COMBO_TIMEOUT` (default 2000), `MAX_MULTIPLIER` (default 10).
- **`StandardControlKeysSchema`**: Teclas predeterminadas (`LEFT`, `RIGHT`, `SHOOT`, `PAUSE`, `RESTART`).
- **`PlayerMovementSchema`**: Parámetros de velocidad y aceleración (`PLAYER_SPEED`, `PLAYER_ACCEL`, `PLAYER_DECEL`, `PLAYER_AIR_ACCEL`, `PLAYER_AIR_DECEL`).
- **`JumpPhysicsSchema`**: Parámetros de física de salto (`PLAYER_JUMP_VEL`, `PLAYER_MIN_JUMP_VEL`, `RISE_GRAVITY`, `FALL_GRAVITY`).
- **`TileGridSchema`**: Tamaño del tilemap (`TILE_SIZE`, default 40).

## Pasos para Crear la Configuración de un Nuevo Juego

### Paso 1: Crear el Schema Zod (`<Juego>ConfigSchema.ts`)

Ubicado en `src/games/<juego>/types/<Juego>ConfigSchema.ts`:

```typescript
import { BaseConfigSchema } from "@tiny-aster/core";
import { z } from "zod";
import {
  ScreenDimensionsSchema,
  PlayerMovementSchema,
  JumpPhysicsSchema,
  TileGridSchema
} from "@tiny-aster/gameplay-kit";

export const NuevoJuegoConfigSchema = BaseConfigSchema.extend({
  ...ScreenDimensionsSchema.shape,
  ...TileGridSchema.shape,
  ...PlayerMovementSchema.shape,
  ...JumpPhysicsSchema.shape,
  // Propiedades específicas
  MI_PARAMETRO_ESPECIAL: z.number().default(100)
});

export type NuevoJuegoConfig = z.infer<typeof NuevoJuegoConfigSchema>;

export const DEFAULT_NUEVO_JUEGO_CONFIG: NuevoJuegoConfig = NuevoJuegoConfigSchema.parse({});
```

### Paso 2: Cargar la Configuración en la Clase Principal (`<Juego>Game.ts`)

En el constructor de la clase del juego:

```typescript
import { BaseGame, ConfigService } from "@tiny-aster/core";
import { NuevoJuegoConfigSchema, NuevoJuegoConfig, DEFAULT_NUEVO_JUEGO_CONFIG } from "./types/NuevoJuegoConfigSchema";

export class NuevoJuegoGame extends BaseGame<...> {
  public readonly gameId = "nuevo-juego";
  private baseConfig: NuevoJuegoConfig;
  private config: NuevoJuegoConfig;

  constructor(options: { gameOptions?: Record<string, unknown> } = {}) {
    super(...);
    this.baseConfig = ConfigService.load<NuevoJuegoConfig>(
      this.gameId,
      NuevoJuegoConfigSchema,
      options.gameOptions?.rawConfig ?? {}
    );
    this.config = this.baseConfig;
  }

  protected override async onRegisterSystems(): Promise<void> {
    const mutators = (this._config.gameOptions?.mutators as any[]) || [];
    this.config = mutators.length > 0
      ? mutators.reduce((cfg, m) => m.apply(cfg), { ...this.baseConfig })
      : { ...this.baseConfig };

    this.world.setResource("GameConfig", this.config);
    this.setupCommonArcadeResources();
    ...
  }
}
```

## Verificación en Tests

Verificá que el schema retorne los defaults esperados con `safeParse({})` y que `ConfigService.load` lance un error si se ingresan tipos o valores inválidos:

```typescript
const parsed = NuevoJuegoConfigSchema.safeParse({});
expect(parsed.success).toBe(true);
expect(parsed.data).toEqual(DEFAULT_NUEVO_JUEGO_CONFIG);
```
