# 📘 Tiny Aster — Monorepo Architecture & Developer Onboarding Guide

Welcome to the **Tiny Aster** codebase documentation. This guide provides a comprehensive technical overview of the monorepo architecture, the core Entity-Component-System (ECS) engine (`@tiny-aster/core`), rendering backends, networking/netcode pipelines, narrative story systems, per-game conventions, quality gates, and common developer pitfalls.

---

## 🗂️ Table of Contents

1. [Quick Start](#1-quick-start)
2. [Project Overview & Monorepo Layout](#2-project-overview--monorepo-layout)
3. [Core Engine Architecture](#3-core-engine-architecture)
   - [3.1 Entity-Component-System (ECS) Paradigm](#31-entity-component-system-ecs-paradigm)
   - [3.2 Determinism & Reproducibility Pillar](#32-determinism--reproducibility-pillar)
   - [3.3 Platform-Agnostic Isolation Boundary](#33-platform-agnostic-isolation-boundary)
   - [3.4 Rendering Pipeline & Command Buffers](#34-rendering-pipeline--command-buffers)
   - [3.5 Authoritative Multiplayer & Rollback Netcode](#35-authoritative-multiplayer--rollback-netcode)
   - [3.6 Narrative & Story Subsystem](#36-narrative--story-subsystem)
4. [Per-Game Reference & Shared Code Conventions](#4-per-game-reference--shared-code-conventions)
   - [4.1 Game Directory Standard](#41-game-directory-standard)
   - [4.2 Catalog of Shipped Games](#42-catalog-of-shipped-games)
   - [4.3 Shared Gameplay Utilities (`src/games/shared/`)](#43-shared-gameplay-utilities-srcgamesshared)
   - [4.4 Visual Design System Rules](#44-visual-design-system-rules)
5. [Development, Testing & Onboarding Guide](#5-development-testing--onboarding-guide)
   - [5.1 Testing Architecture](#51-testing-architecture)
   - [5.2 Mandated Quality Gates](#52-mandated-quality-gates)
   - [5.3 Common Pitfalls & Anti-Patterns](#53-common-pitfalls--anti-patterns)
   - [5.4 Documented Discrepancies & Gap Analysis](#54-documented-discrepancies--gap-analysis)
   - [5.5 Glossary of Engine Terms](#55-glossary-of-engine-terms)

---

## 1. Quick Start

### Prerequisites
- **Node.js**: `≥ 20.0.0` (enforced in `package.json:173`)
- **pnpm**: `10.30.3` (enforced via `"packageManager": "pnpm@10.30.3"` in `package.json:6`)
- **Expo Go / Development Build**: Required for mobile device verification.

### Installation & Client Execution
```bash
# Install workspace dependencies across all packages
pnpm install

# Start client application (Expo Router app; builds @tiny-aster/core first via Turborepo)
pnpm start

# Run on specific target platforms
pnpm web       # React Native Web (<canvas> renderer)
pnpm android   # Expo Android emulator/device (@shopify/react-native-skia renderer)
pnpm ios       # Expo iOS simulator/device (@shopify/react-native-skia renderer)
```

### Authoritative Server Execution
```bash
# Navigate to server workspace and run Colyseus dev server
cd server
pnpm install
pnpm run dev   # Runs Colyseus server on default port 2567
```

---

## 2. Project Overview & Monorepo Layout

Tiny Aster is structured as a **pnpm workspace** managed by **Turborepo** (`turbo.json`).

### Workspace Layout & Package Ownership Boundaries

| Package / Directory | Workspace Name | Responsibility | Key Dependencies / Boundaries |
| :--- | :--- | :--- | :--- |
| `packages/core/` | `@tiny-aster/core` | Pure ECS engine, physics, math, snapshots, component pooling, audio contracts, narrative DSL runtime. | **Zero platform dependencies.** Cannot import `react-native`, `expo-*`, `skia`, `@colyseus`, or `src/games/`. |
| `packages/renderer-canvas/` | `@tiny-aster/renderer-canvas` | HTML5 `<canvas>` rendering adapter. Consumes `RenderCommandBuffer`. | Web / Canvas2D browser execution (`CanvasRenderer.ts`). |
| `packages/renderer-skia/` | `@tiny-aster/renderer-skia` | React Native Skia rendering adapter. Consumes `RenderCommandBuffer`. | `@shopify/react-native-skia` for high-performance native vector rendering (`SkiaRenderer.ts`). |
| `packages/network/` | `@tiny-aster/network` | Abstract network interfaces (`NetworkTransport`), prediction, interpolation, and reconciler helpers. | Transport-agnostic netcode abstractions. |
| `packages/network-colyseus/`| `@tiny-aster/network-colyseus`| Colyseus client transport adapter. | `@colyseus/sdk` integration (`ColyseusTransport.ts`). |
| `packages/react-native/` | `@tiny-aster/react-native` | React Native hooks (`useGame.ts`, `useWorld.ts`, `useMultiplayer.ts`) and platform UI context providers. | Expo and React Native glue layer. |
| `src/games/*` | Application | Individual game implementations built on top of `@tiny-aster/core`. | `asteroids`, `space-invaders`, `flappybird`, `pong`, `geometrywars`, `platformer`, `echorunner`, `shared`. |
| `server/` | Application | Authoritative multiplayer server running Colyseus. | Node.js headless environment. Instantiates games headlessly for server-side validation. |

### Concrete Technology Stack Versions (`package.json`)
- **React Native**: `0.83.10`
- **React**: `19.2.0`
- **Expo**: `~55.0.28`
- **TypeScript**: `~5.9.3`
- **Zod**: `^4.1.4` (runtime configuration & schema validation)
- **Colyseus SDK**: `^0.17.37` (`@colyseus/sdk`)
- **Skia Renderer**: `2.4.18` (`@shopify/react-native-skia`)
- **Network Serialization**: `^1.11.12` (`msgpackr`)
- **Monorepo / Build Orchestrator**: `^2.9.18` (`turbo`) / `^8.5.1` (`tsup`) / `^0.8.1` (`@swc/core`)
- **AST / Code Quality Analysis**: `^28.0.0` (`ts-morph`), `^0.45.3` (`@ast-grep/napi`), `^5.1.2` (`jscpd`)

### Engine & App Entry Points
1. **Application Shell Entry**: `expo-router/entry` (configured as `"main": "expo-router/entry"` in root `package.json:3`).
2. **Core Engine Surface**: `packages/core/src/index.ts` (re-exports all core ECS, physics, loop, narrative, and utility symbols).
3. **Game Class Surface**: Each game's concrete class extending `BaseGame`, e.g.:
   - Space Invaders: `src/games/space-invaders/SpaceInvadersGame.ts`
   - Asteroids: `src/games/asteroids/AsteroidsGame.ts`
   - Flappy Bird: `src/games/flappybird/FlappyBirdGame.ts`
   - Pong: `src/games/pong/PongGame.ts`
   - Geometry Wars: `src/games/geometrywars/GeometryWarsGame.ts`
   - Platformer: `src/games/platformer/PlatformerGame.ts`
   - Echo Runner: `src/games/echorunner/EchoRunnerGame.ts`

---

## 3. Core Engine Architecture

### 3.1 Entity-Component-System (ECS) Paradigm

The core engine implements a decoupled Entity-Component-System pattern built for speed and snapshot efficiency.

```
       +-------------------------------------------------------+
       |                        World                          |
       |  (Entity Container, Query Index, Resource Registry)   |
       +-------------------------------------------------------+
           |                         |                     |
           v                         v                     v
   +---------------+         +---------------+     +---------------+
   |   Entities    |         |  Components   |     |   Schedule    |
   | (Numeric IDs) |         | (Pure Data)   |     | (System Phases)|
   +---------------+         +---------------+     +---------------+
                                                           |
                                                           v
                                                   +---------------+
                                                   |    Systems    |
                                                   | (Per-Tick Logic)|
                                                   +---------------+
```

- **`World` (`packages/core/src/ecs/World.ts:1`)**: The central container managing entity allocation, component bitmasks, spatial culling indexes, global resources (`world.setResource`/`world.getResource`), and command buffer execution.
- **`System` (`packages/core/src/ecs/System.ts:1`)**: Abstract base class for per-tick logic. Systems implement `update(dt: number)` and access entities exclusively through typed queries (`world.query("Transform", "Velocity")`).
- **`Schedule` (`packages/core/src/ecs/Schedule.ts:1`)**: Manages ordered system execution phases:
  1. `Input`
  2. `Animation`
  3. `Physics`
  4. `Collision`
  5. `GameRules`
  6. `Presentation`
- **`WorldCommandBuffer` (`packages/core/src/ecs/WorldCommandBuffer.ts:1`)**: Deferred mutation buffer accessible via `world.commands`. Prevents instant array mutation or iterator invalidation during system iteration.
- **`BlueprintRegistry` (`packages/core/src/ecs/BlueprintRegistry.ts:1`)**: Prefab entity construction pattern (`world.blueprints.register("bullet", blueprintFn)`). Allows safe instantiation via `spawnBlueprintEntity()` or `world.commands.spawnBlueprint()`.
- **`BaseGame` (`packages/core/src/runtime/BaseGame.ts:107-590`)**: Template-method lifecycle manager (`init`, `start`, `pause`, `resume`, `restart`, `destroy`) encapsulating the game loop, scene manager, input system, audio player, and FNV-1a state hashing.

---

### 3.2 Determinism & Reproducibility Pillar

Determinism is a primary design guarantee of `@tiny-aster/core`. A game run with identical inputs and initial seed will produce identical frame-by-frame snapshots across platforms and runtimes.

#### Key Mechanics Enabling Determinism:
1. **Fixed Timestep**: The engine simulation runs at a fixed 60Hz tick (`step = 1 / 60` in `GameLoop.ts` and `BaseGame.step()`).
2. **Isolated Gameplay Randomness**: All gameplay-affecting RNG MUST originate from `world.gameplayRandom` (a seeded PRNG). `world.renderRandom` is restricted to purely visual effects (e.g. particle trajectories, screen shakes) and does not affect simulation state.
3. **Binary & FNV-1a Hashing (`packages/core/src/snapshots/SnapshotHash.ts`)**: Fast hexadecimal hashing (`hashSoA` for Structure-of-Arrays snapshots) avoids heap allocations and string concatenation during network reconciliation ticks.
4. **Deterministic Replay System (`packages/core/src/replay/DeterministicReplay.ts`)**: `DeterministicReplayRecorder` captures initial seeds and compressed `InputFrame` bitmasks per tick, allowing `DeterministicReplayPlayer` and `DivergenceDetector` to replay or verify matches bit-for-bit.

---

### 3.3 Platform-Agnostic Isolation Boundary

To prevent platform lock-in and ensure testability, `@tiny-aster/core` has strict import boundaries enforced in CI:

1. **Boundary Shell Script (`scripts/check-core-boundaries.sh:1-45`)**:
   Fails CI if any file inside `packages/core/src/` imports:
   - `react-native`
   - `expo-*`
   - `@shopify/react-native-skia`
   - `@colyseus`
   - `src/games/` or `src/app/`
2. **AST Determinism Linter (`scripts/ast-determinism-linter.ts:1-180`)**:
   Uses `ts-morph` to inspect AST nodes across `packages/core/src` and `src/games/` systems:
   - **Forbidden APIs**: Flagged if `Math.random()`, `Date.now()`, or `performance.now()` are called inside simulation or systems.
   - **Unsorted Iteration**: Flagged if `Object.keys()` or `Object.entries()` are iterated without prior `.sort()`.
   - **Direct Mutations**: Flagged if `world.addComponent()`, `world.removeComponent()`, `world.createEntity()`, or `world.removeEntity()` are called directly during system updates instead of using `world.commands`.

---

### 3.4 Rendering Pipeline & Command Buffers

Rendering in Tiny Aster is completely decoupled from gameplay simulation through a **Command Buffer** pattern.

```
+------------------+     generates     +----------------------+     consumed by     +------------------------+
| Gameplay Systems | ----------------> | RenderCommandBuffer  | ------------------> | CanvasRenderer (Web)   |
| (Physics/Render) |                   | (RenderSnapshot)     |                     | SkiaRenderer (Native)  |
+------------------+                   +----------------------+                     +------------------------+
```

1. **`RenderCommandBuffer` (`packages/core/src/rendering/RenderCommandBuffer.ts:1`)**: Systems do not execute canvas/Skia drawing commands directly. Instead, `RenderUpdateSystem` populates a `RenderCommandBuffer` with draw operations (`drawShape`, `drawSprite`, `drawText`, `applyEffect`).
2. **Pluggable Renderers**:
   - `CanvasRenderer` (`packages/renderer-canvas/src/CanvasRenderer.ts:1`): Renders draw commands to an HTML5 `<canvas>` context for Web.
   - `SkiaRenderer` (`packages/renderer-skia/src/SkiaRenderer.ts:1`): Renders draw commands to a React Native Skia surface for iOS and Android.
3. **Shape Drawer Registration Contract**: Both renderers implement `registerShape(shapeName, shapeDrawer)` and `registerBackgroundEffect(effectName, effectDrawer)`, ensuring identical visual presentation across backends.

---

### 3.5 Authoritative Multiplayer & Rollback Netcode

Multiplayer architecture uses client-side prediction, server reconciliation, and remote interpolation over Colyseus websocket connections.

```
  Client (Local)                                         Server (Authoritative)
+-------------------------+                           +--------------------------+
| LocalPredictionSystem   | --- Sends Input Frame --> | SpaceInvadersRoom        |
| (Predicts local player) |                           | (Runs BaseGame headlessly|
|                         |                           |  at 60Hz tick)           |
| RollbackSimulation      | <--- World Snapshot ----- |                          |
| (Reconciles divergence) |     (Broadcast @ 20Hz)    | Flushes State Snapshot   |
+-------------------------+                           +--------------------------+
```

1. **`LocalPredictionSystem` (`packages/core/src/network/LocalPredictionSystem.ts:1`)**: Instantly applies local input frames to client-controlled entities without waiting for server roundtrips.
2. **`RollbackSimulation` & `MultiplayerReconciler` (`packages/core/src/network/RollbackSimulation.ts`)**: Upon receiving an authoritative server state snapshot (`applyServerStateUpdate`), if state divergence is detected via snapshot hash comparison, the reconciler rolls back simulation state to the server tick and re-simulates unacknowledged input frames.
3. **`RemoteInterpolationSystem` (`packages/core/src/network/RemoteInterpolationSystem.ts:1`)**: Smoothly interpolates transform positions and rotations for remote opponents to eliminate jitter under high ping.
4. **Colyseus Integration (`packages/network-colyseus/` & `server/src/BaseRoom.ts`)**:
   - `ColyseusTransport.ts`: Client adapter implementing `NetworkTransport`.
   - `BaseRoom.ts` & `SpaceInvadersRoom.ts`: Server room handlers instantiating `BaseGame` subclass instances headlessly in Node.js.

---

### 3.6 Narrative & Story Subsystem

The narrative subsystem (`packages/core/src/story/`) powers campaign mode, branching CYOA dialogues, meta-progression, and encounter resolution.

#### Narrative Architecture & Validator Contracts:
1. **`StoryGraphValidator.ts` (`packages/core/src/story/StoryGraphValidator.ts:1`)**:
   Validates top-level narrative graph structure (`StoryGraph`):
   - Verifies entry point existence (`entryNodeId`).
   - Rejects broken transitions or choices targeting non-existent node IDs.
   - Flags unreachable orphan nodes and unhandled dead ends (`isEndNode: false` on terminal nodes).
   - Validates declared variables and flags referenced in node conditions/effects.
2. **`SemanticValidator.ts` (`packages/core/src/story/SemanticValidator.ts:1`)**:
   Validates encounter DSL definitions (`MiniGameEncounterDSL`):
   - Confirms registered `gameId` validity via `GameDefinitionRegistry.normalizeId`.
   - Rejects duplicate encounter IDs or outcome rule IDs.
   - Verifies metric references, secrets, evidence items, and target destination nodes.
3. **`StoryPackageValidator.ts` (`packages/core/src/story/StoryPackageValidator.ts:1`)**:
   Validates complete bundle integrity (`StoryPackage`):
   - Validates manifest metadata.
   - Delegates topology checks to `StoryGraphValidator`.
   - Performs cross-graph semantic checks (e.g. verifying character references and evidence produced/consumed in deduction rules).
4. **Arcade Adapter Pipeline (`src/games/<game>/story/*Encounter.ts`)**:
   Minigames integrate with the narrative story graph using encounter adapters extending `BaseArcadeAdapter` (`src/games/shared/story/adapters/BaseArcadeAdapter.ts`).
   The lifecycle flows: `StoryNode (gameplay)` → `ArcadeOrchestrator.startRun()` → `MiniGameModifierResolver` → `Adapter.initialize()` → `Adapter.emitResult()` → `OutcomeRuleEngine.evaluate()` → `StoryEffectApplier.applyEffects()`.

---

## 4. Per-Game Reference & Shared Code Conventions

### 4.1 Game Directory Standard

Every minigame located under `src/games/<game-id>/` follows a standardized internal layout:

```
src/games/<game-id>/
├── __tests__/                     # Colocated Jest unit/integration tests
├── config/                        # Default configurations and DTO entity blueprints
├── rendering/                     # Shape drawers and renderer registration
├── scenes/                        # Game scene classes (extending Scene)
├── story/                         # Narrative campaign encounter adapters
├── systems/                       # Per-tick ECS System classes
├── types/
│   ├── <Game>Types.ts             # Game state types and GAME_CONFIG object
│   └── <Game>ConfigSchema.ts      # Zod validation schema (extending BaseConfigSchema)
├── EntityFactory.ts / Pool.ts     # Prefab constructors and object pools
├── <Game>ArcadeAdapter.ts         # Story mode adapter
├── <Game>Game.ts                  # Main class extending BaseGame
└── index.ts                       # Public package surface
```

---

### 4.2 Catalog of Shipped Games

| Game ID | Directory | Highlights & Mechanics | Primary Config File |
| :--- | :--- | :--- | :--- |
| `space-invaders` | `src/games/space-invaders/` | Invader formations (`SpaceInvadersFormationSystem.ts`), shields, combo multipliers, phase-adaptive Boss waves (`boss` shape). | `types/SpaceInvadersConfigSchema.ts` |
| `asteroids` | `src/games/asteroids/` | Ship drift physics (`ShipPhysics.ts`), screen wrap-around, procedural asteroid splitting, hyperspace jumps. | `config/AsteroidsConfigSchema.ts` |
| `flappybird` | `src/games/flappybird/` | Precision gravity impulse, dynamic pipe generation, scrolling parallax background effects. | `types/FlappyBirdConfigSchema.ts` |
| `pong` | `src/games/pong/` | Paddle reflection physics, spin impartation, authoritative Colyseus multiplayer (`PongRoom.ts`). | `types/PongConfigSchema.ts` |
| `geometrywars` | `src/games/geometrywars/` | Twin-stick firing, neon vector enemies (chaser, evader, grunt, seeker), bomb clearance. | `config/GeometryWarsConfigSchema.ts` |
| `platformer` | `src/games/platformer/` | Variable jump height, Coyote time, pre-landing input buffering, ice/bounce tiles, level grammar. | `types/PlatformerConfigSchema.ts` |
| `echorunner` | `src/games/echorunner/` | Endless runner momentum, tile collision, enemy state machines (`Patrol`, `Alert`, `Attack`). | `types/EchoRunnerConfigSchema.ts` |

---

### 4.3 Shared Gameplay Utilities (`src/games/shared/`)

Shared code MUST be placed under `src/games/shared/` according to domain rules (`src/games/shared/README.md`):

1. **`arcade/`**: Centralized `ComboComponent` & `ComboSystem`, `LootSystem`, `PowerUpSystem`, `PowerUpEffectRegistry` (speed_boost, shield, extra_life, score_multiplier, double_jump).
2. **`combat/`**: Centralized `CombatSystem`, `DamageComponent`, `FactionComponent`.
3. **`spawn/`**: Centralized `SpawnDirectorSystem`, `SpawnDirectorComponent`, `WaveMemberComponent`.
4. **`rendering/`**: Canvas/Skia visual math calculation helpers (`asteroidsMath.ts`, `spaceInvadersMath.ts`, `geometry.ts`).
5. **`story/`**: Reusable encounter adapters (`BaseArcadeAdapter.ts`) and narrative helpers.

*Rule*: Code belongs in `src/games/shared/` **only if used by 2 or more games**. Single-game code must remain within `src/games/<game>/`.

---

### 4.4 Visual Design System Rules

As codified in `AGENTS.md`:

1. **Zero Raw Hex Colors in Components**: Components and game screens must not contain inline hex strings (e.g. `"#00f0ff"`). Colors MUST be retrieved from centralized theme tokens in `src/theme/colors.ts` (e.g. `colors.cyan`, `colors.pink`).
2. **Headless / Server Import Rule**: When importing theme colors inside game simulation files or headless server code, import **directly from `src/theme/colors`** (`import { colors } from "../../../theme/colors"`). Never import from `src/theme/index.ts` or `@/theme`, which transitively loads `react-native` dependencies (`Platform` from `effects.ts`) and breaks Node/Colyseus server execution.
3. **Shared UI Component Reuse**: Reusable UI elements belong in `src/components/ui/` (`GameScreen`, `NeonButton`, `GameTitle`, `PlayerNameInput`, `GameInstructions`, `HighScoreText`, `BackButton`).
4. **Local StyleSheet Scope**: Game-specific `StyleSheet` objects are restricted to layout, structural positioning, and container dimensions. Branding and visual theme tokens are governed centrally by `src/theme/`.

---

## 5. Development, Testing & Onboarding Guide

### 5.1 Testing Architecture

The codebase uses **Jest** (`jest.config.cjs`, `jest-expo`) for testing across core, renderers, networks, and game projects.

- **Unit Tests**: Test ECS internals, component set pooling, snapshots, and math in `packages/core/src/__tests__`.
- **Integration Tests**: Test system schedules, physical integration, and collision pipelines in `packages/core/tests`.
- **Per-Game Tests**: Test gameplay rules, config validation, and state systems in `src/games/<game>/__tests__/`.

#### Test Execution Commands:
```bash
# Run all workspace test suites via Turborepo
pnpm test

# Run tests in CI mode with memory limit guards
pnpm run test:ci

# Run specific game test suite
pnpm --filter=@tiny-aster/core test
```

---

### 5.2 Mandated Quality Gates

Before opening a pull request or submitting code, developers MUST execute the full CI suite locally:

```bash
pnpm run test                 # Run all Jest test suites
pnpm run lint                 # ESLint checks across monorepo
pnpm run story:lint           # Validate story graphs, narrative DSL, and terminal nodes
pnpm run typecheck:core       # Strict typecheck of @tiny-aster/core
pnpm run typecheck:app        # Strict typecheck of Expo app layer
pnpm run check:core-boundaries# Bash boundary verification script
pnpm run check:ratchet        # Typecast ratchet audit check
pnpm run check:duplication    # jscpd code duplication ratchet check
pnpm run docs:check           # API Extractor snapshot check (etc/asteroides.api.md)
pnpm run ci                   # Executes all required pre-commit checks in sequence
```

*Note on API Documentation*: If public exports in `@tiny-aster/core` are modified, run `pnpm docs:extract` to update `etc/asteroides.api.md`. Do not manually edit the `.api.md` snapshot file.

---

### 5.3 Common Pitfalls & Anti-Patterns

1. **Transitive React Native Imports in Headless Code**
   - *Symptom*: Server or headless node test fails with `ReactNativePublicAPI is not defined`.
   - *Cause*: Importing from `src/theme/index.ts` or `@/theme` in game logic pulls in `effects.ts` which imports `Platform` from `react-native`.
   - *Fix*: Import directly from `src/theme/colors` (`import { colors } from "src/theme/colors"`).

2. **Direct Structural World Mutation in System Update Loops**
   - *Symptom*: Iterator invalidation or skipped entity queries during system execution.
   - *Cause*: Calling `world.createEntity()`, `world.removeEntity()`, `world.addComponent()`, or `world.removeComponent()` directly inside a system's `update()` method.
   - *Fix*: Use deferred commands via `world.commands.createEntity()`, `world.commands.removeEntity()`, `world.commands.addComponent()`, etc.

3. **Unseeded Randomness or System Timing in Simulation**
   - *Symptom*: Rollback desynchronization, replay mismatch, or failing determinism checks.
   - *Cause*: Calling `Math.random()`, `Date.now()`, or `performance.now()` in physics/systems logic.
   - *Fix*: Use `world.gameplayRandom.nextFloat()` for simulation RNG and the system `dt` argument for timing.

4. **Unsorted Object Key Iteration**
   - *Symptom*: Non-deterministic execution differences across V8 engine versions or runtimes.
   - *Cause*: Iterating `Object.keys(map)` or `Object.entries(map)` directly without sorting.
   - *Fix*: Always sort keys prior to iteration (`Object.keys(map).sort().forEach(...)`).

5. **Editing Build Artifacts Directly**
   - *Symptom*: Changes wiped out on subsequent build steps.
   - *Cause*: Modifying files in `dist/`, `compiled-js/`, or `build/`.
   - *Fix*: Locate source files under `packages/` or `src/` and run `pnpm run build`.

---

### 5.4 Documented Discrepancies & Gap Analysis

When comparing the initial specifications in `GDD.md` against actual implementation code, developers should be aware of the following documented discrepancies:

1. **Asteroids Spawning Architecture (`GDD.md` Part 4.3 vs `AsteroidGameStateSystem.ts`)**
   - *Specification*: `GDD.md` originally proposed migrating all wave spawning across games to the central `SpawnDirectorSystem` (`src/games/shared/spawn/`).
   - *Actual Implementation*: Asteroids intentionally retains its procedural wave spawner in `AsteroidGameStateSystem.ts`. Because asteroid spawning requires spatial wrap-around checks away from player ship coordinates rather than linear wave queues, applying `SpawnDirectorSystem` would introduce unnecessary overhead. This postponement is an acknowledged design decision documented in `GDD.md`.
2. **Pong Combo Triggering (`GDD.md` Part 4.1 vs `PongCollisionSystem.ts`)**
   - *Specification*: `GDD.md` lists combo multipliers for Space Invaders and Geometry Wars.
   - *Actual Implementation*: Pong also utilizes `ComboComponent` and `ComboSystem` from `src/games/shared/arcade/`, incrementing combo multipliers on consecutive paddle deflections and resetting upon scoring.
3. **Core Story Package Location (`AGENTS.md` vs `packages/core/src/story/`)**
   - *Specification*: Ideally, engine cores should not bundle high-level game content.
   - *Actual Implementation*: `story/` currently resides inside `@tiny-aster/core`. Extensibility checks in `scripts/check-core-boundaries.sh` ensure `story/` maintains absolute zero dependencies on platform packages or specific games. Extracting `story/` into `@tiny-aster/story` remains an acknowledged future architectural roadmap task.

---

## 5.5 Glossary of Engine Terms

- **`World`**: The primary ECS container instance storing all active entities, component arrays, spatial indexes, and global resource singletons.
- **`BaseGame`**: The abstract lifecycle framework extending `IGame` and `Simulation`, providing template methods (`init`, `start`, `pause`, `resume`, `restart`, `destroy`) and snapshot hashing.
- **`Blueprint`**: A declarative entity factory function registered in `BlueprintRegistry` used to instantiate prefabs with pre-configured components.
- **`Schedule`**: The phase-ordered execution manager (`Input` → `Animation` → `Physics` → `Collision` → `GameRules` → `Presentation`) orchestrating system execution order per frame tick.
- **`InputFrame` / `CompactInputFrame`**: Compressed bitmask payloads representing player inputs per tick, enabling minimal network bandwidth overhead.
- **`RenderCommandBuffer`**: An intermediary buffer of draw operations produced by `RenderUpdateSystem` and consumed by pluggable backend renderers (`CanvasRenderer` / `SkiaRenderer`).
- **`gameplayRandom`**: The seeded pseudorandom number generator attached to `World` enforcing deterministic execution across all platforms.
- **`StoryPackage` / `StoryGraph`**: Top-level narrative data bundle containing directed graphs of `StoryNode` items, character metadata, and dialogue beats.
- **`Encounter DSL`**: Declarative JSON schema (`MiniGameEncounterDSL`) defining minigame objectives, difficulty modifiers, and outcome rules for narrative campaigns.
- **Rollback / Reconciliation**: Netcode process wherein client simulation state is restored to a previous server tick snapshot and re-simulated forward using unacknowledged input frames to resolve state divergence.

---
*End of Guide. For visual design guidelines, refer to `AGENTS.md`. For game design and balance tuning tables, refer to `GDD.md`.*
