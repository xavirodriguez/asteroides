# Sistema de Configuración de Juegos en ArcadeGames

## Arquitectura Centralizada con Zod + ConfigService

Para garantizar type safety, validación en tiempo de ejecución y valores por defecto consistentes, todos los minijuegos en ArcadeGames declaran su configuración utilizando **Zod** y la cargan mediante `ConfigService`.

## Cómo Declarar la Configuración de un Nuevo Juego

Al crear un nuevo juego, en lugar de definir un objeto plano con valores harcodeados, seguí este patrón en `src/games/<juego>/types/<Juego>ConfigSchema.ts`:

### 1. Reutilizar Shapes Existentes

En `@tiny-aster/gameplay-kit` existen shapes reutilizables para las características comunes:

- `ScreenDimensionsSchema`: `SCREEN_WIDTH`, `SCREEN_HEIGHT`, `SCREEN_CENTER_X`, `SCREEN_CENTER_Y`.
- `ComboConfigSchema`: `COMBO_TIMEOUT`, `MAX_MULTIPLIER`.
- `StandardControlKeysSchema`: Mapeo estándar de teclas.
- `PlayerMovementSchema`: `PLAYER_SPEED`, `PLAYER_ACCEL`, `PLAYER_DECEL`, `PLAYER_AIR_ACCEL`, `PLAYER_AIR_DECEL`.
- `JumpPhysicsSchema`: `PLAYER_JUMP_VEL`, `PLAYER_MIN_JUMP_VEL`, `RISE_GRAVITY`, `FALL_GRAVITY`.
- `TileGridSchema`: `TILE_SIZE`.

### 2. Definir el Schema Extendiendo `BaseConfigSchema`

```typescript
import { BaseConfigSchema } from "@tiny-aster/core";
import { z } from "zod";
import {
  ScreenDimensionsSchema,
  PlayerMovementSchema,
  JumpPhysicsSchema
} from "@tiny-aster/gameplay-kit";

export const MiJuegoConfigSchema = BaseConfigSchema.extend({
  ...ScreenDimensionsSchema.shape,
  ...PlayerMovementSchema.shape,
  ...JumpPhysicsSchema.shape,
  // Campos específicos del juego con defaults
  MI_PROPIEDAD_ESPECIAL: z.number().default(100)
});

export type MiJuegoConfig = z.infer<typeof MiJuegoConfigSchema>;

export const DEFAULT_MI_JUEGO_CONFIG: MiJuegoConfig = MiJuegoConfigSchema.parse({});
```

### 3. Cargar la Configuración en la Clase Principal del Juego

En la clase `<Juego>Game.ts`:

```typescript
import { BaseGame, ConfigService } from "@tiny-aster/core";
import { MiJuegoConfigSchema, MiJuegoConfig, DEFAULT_MI_JUEGO_CONFIG } from "./types/MiJuegoConfigSchema";

export class MiJuegoGame extends BaseGame<...> {
  public readonly gameId = "mijuego";
  private baseConfig: MiJuegoConfig;
  private config: MiJuegoConfig;

  constructor(options: { gameOptions?: Record<string, unknown> } = {}) {
    super(...);
    this.baseConfig = ConfigService.load<MiJuegoConfig>(
      this.gameId,
      MiJuegoConfigSchema,
      options.gameOptions?.rawConfig ?? {}
    );
    this.config = this.baseConfig;
  }

  protected override async onRegisterSystems(): Promise<void> {
    // Aplicar mutadores si aplican
    const mutators = (this._config.gameOptions?.mutators as any[]) || [];
    this.config = mutators.length > 0
      ? mutators.reduce((cfg, m) => m.apply(cfg), { ...this.baseConfig })
      : { ...this.baseConfig };

    // Registrar como recursos en el world para que los sistemas accedan
    this.world.setResource("GameConfig", this.config);
    this.setupCommonArcadeResources();
    ...
  }
}
```

## Beneficios

1. **Zero Boilerplate**: No hace falta repetir dimensiones de pantalla, físicas básicas ni códigos de teclas.
2. **Validación Automática**: `ConfigService.load()` valida los datos contra Zod y lanza un error descriptivo si se pasa una configuración inválida.
3. **Persistencia y Mutadores**: Permite mutar la configuración de forma segura durante partidas roguelite/campaña sin modificar los defaults base.
