Unificar la configuración de juegos en ArcadeGames usando el patrón Zod + ConfigService ya
existente (validado en Pong), y extenderlo con shapes reutilizables para que crear un
nuevo juego sea, en la mayor parte posible, declarar características en un schema en
lugar de escribir código de inicialización repetido.

CONTEXTO EXISTENTE (no reinventar, extender):

- packages/core/src/config/ConfigService.ts: ConfigService.load(gameId, schema, rawConfig)
  ya valida y tipa config con Zod.
- packages/core/src/config/BaseConfigSchema.ts: BaseConfigSchema ya define KEYS.PAUSE/RESTART.
- src/games/shared/arcade/types/ArcadeConfigSchema.ts: ya define ScreenDimensionsSchema,
  ComboConfigSchema, StandardControlKeysSchema como shapes de Zod reutilizables.
- src/games/pong/types/PongConfigSchema.ts + PongGame.ts (líneas ~97-108): implementación
  de referencia a seguir. Usa BaseConfigSchema.extend(...) y ConfigService.load().

PROBLEMA A RESOLVER:
Los siguientes juegos definen su config como objeto plano sin Zod, sin ConfigService, y
repiten SCREEN_WIDTH/SCREEN_HEIGHT/KEYS manualmente en cada archivo:

- src/games/platformer/PlatformerGame.ts (PLATFORMER_CONFIG, líneas ~68-81)
- src/games/echorunner/types/EchoRunnerTypes.ts (ECHO_CONFIG)
- src/games/flappybird/types/FlappyBirdTypes.ts (FLAPPY_CONFIG, líneas ~85-109)
- src/games/space-invaders/types/SpaceInvadersTypes.ts (GAME_CONFIG, líneas ~202-264)
- src/games/asteroids/types/AsteroidConfigSchema.ts (revisar si ya sigue el patrón; si no,
  incluirlo también)
- src/games/geometrywars/config/GeometryWarsConfig.ts (revisar si ya sigue el patrón)

TAREAS:

1. Extender src/games/shared/arcade/types/ArcadeConfigSchema.ts con los shapes que faltan
   y que ya se repiten entre juegos, por ejemplo:

   - PlayerMovementSchema (ACCEL, DECEL, AIR_ACCEL, AIR_DECEL, SPEED) — usado por
     Platformer y EchoRunner casi idéntico.
   - JumpPhysicsSchema (RISE_GRAVITY, FALL_GRAVITY, JUMP_VEL, MIN_JUMP_VEL) — idem.
   - TileGridSchema (TILE_SIZE) para juegos basados en tilemap.
     No romper StandardControlKeysSchema/ComboConfigSchema/ScreenDimensionsSchema existentes;
     solo añadir shapes nuevos siguiendo la misma convención (z.object con .default(...)).

2. Para cada uno de los 4-6 juegos listados arriba, crear un archivo
   <juego>/types/<Juego>ConfigSchema.ts que:

   - Defina `<Juego>ConfigSchema = BaseConfigSchema.extend({ ...ScreenDimensionsSchema.shape,
...otros shapes de shared que aplican, + campos específicos del juego })`.
   - Exporte `type <Juego>Config = z.infer<typeof <Juego>ConfigSchema>`.
   - Exporte `DEFAULT_<JUEGO>_CONFIG` con los mismos valores numéricos que el objeto plano
     original (para no cambiar comportamiento del juego).

3. Reemplazar el objeto plano `<JUEGO>_CONFIG` en cada archivo de juego por la carga vía
   `ConfigService.load(this.gameId, <Juego>ConfigSchema, rawConfig)`, siguiendo exactamente
   el patrón de PongGame.ts (líneas 97-108): soporte de mutators, seteo de "GameConfig" y
   "ScreenConfig" como resources del world.
   IMPORTANTE: mantener retrocompatibilidad — cualquier código que hoy importa
   PLATFORMER*CONFIG, ECHO_CONFIG, FLAPPY_CONFIG, GAME_CONFIG directamente como constante
   debe seguir funcionando (puede seguir exportando el DEFAULT*\*\_CONFIG con el mismo nombre
   si es necesario, o actualizar los imports en el mismo PR).

4. Escribir tests en packages/core/tests/ (o junto a cada juego) que verifiquen:

   - Que cada <Juego>ConfigSchema.safeParse({}) produce los mismos valores default que el
     antiguo objeto plano (para detectar regresiones numéricas).
   - Que ConfigService.load lanza error descriptivo si se pasa un valor inválido (ej.
     SCREEN_WIDTH negativo), igual que ya se testea en packages/core/tests/ConfigService.test.ts.

5. Al finalizar, documentar en un README breve (docs/design/ o similar) el flujo para crear
   un nuevo juego usando este sistema: "para un nuevo juego, extendé BaseConfigSchema con
   los shapes de ArcadeConfigSchema que necesites, agregá los campos específicos, y listo:
   tenés validación, defaults y config tipada sin escribir lógica de inicialización manual."

RESTRICCIONES:

- No modificar el comportamiento runtime de los juegos: los valores default deben ser
  idénticos a los actuales.
- No tocar PongGame.ts/PongConfigSchema.ts salvo si ArcadeConfigSchema añade shapes que
  Pong también debería adoptar (opcional, de bajo riesgo).
- Ejecutar la suite de tests existente de cada juego afectado (buscar
  packages/core/tests/_<Juego>_.test.ts y src/games/<juego>/\*_/_.test.ts) para confirmar
  que no hay regresiones antes de dar la tarea por terminada.
