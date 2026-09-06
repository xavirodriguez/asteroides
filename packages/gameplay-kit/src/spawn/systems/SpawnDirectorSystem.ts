import { System, World, Entity, ComponentRegistry, EventBus } from "@tiny-aster/core";
import { SpawnDirectorComponent, WaveDefinition, SpawnRequest, WaveMemberComponent } from "../components/SpawnComponents";

/**
 * SpawnDirectorSystem orchestrates the sequential spawning of wave definitions,
 * managing pre-wave and post-wave cooldowns, and checking wave completion.
 * Runs deterministically in the Simulation phase.
 * @public
 */
export class SpawnDirectorSystem<
  TComponents extends ComponentRegistry = ComponentRegistry,
  TEvents extends Record<string, any> = Record<string, any>
> extends System<TComponents, TEvents> {

  constructor() {
    super();
  }

  public update(world: World<TComponents, TEvents>, deltaTime: number): void {
    if (world.getResource("IsPaused") === true) return;
    const gameState = world.getSingleton("GameState" as any) as any;
    if (gameState && (gameState.readyRemaining > 0 || gameState.intermissionRemaining > 0 || gameState.continueCountdownRemaining > 0)) return;

    const directorEntity = world.query("SpawnDirector" as any)[0];
    if (directorEntity === undefined) return;

    // Load active director state
    const director = world.getComponent(directorEntity, "SpawnDirector" as any) as any as SpawnDirectorComponent;
    if (!director) return;

    const waveDefinitions = world.getResource<WaveDefinition[]>("WaveDefinitions") || [];

    let waveIndex = director.waveIndex;
    let status = director.status;
    const initialStatus = status;
    let cooldownRemaining = director.cooldownRemaining;
    let waveElapsedTime = director.waveElapsedTime;
    let pendingSpawns = [...director.pendingSpawns];
    let activeWaveId = director.activeWaveId;
    let enemiesRemaining = director.enemiesRemaining;

    if (status === "idle") {
      if (waveIndex >= 0 && waveIndex < waveDefinitions.length) {
        const waveDef = waveDefinitions[waveIndex];
        status = "spawning";
        activeWaveId = waveDef.id;
        waveElapsedTime = 0;
        pendingSpawns = waveDef.spawns.map(spawn => ({
          ...spawn,
          spawnTime: (spawn.delay || 0)
        }));
        enemiesRemaining = 0;

        const eventBus = world.getEventBus() as EventBus;
        if (eventBus) {
          eventBus.emitDeferred("spawn:wave_start", {
            waveIndex,
            waveId: waveDef.id,
            isBossWave: !!waveDef.isBossWave
          });
        }
      }
    }

    if (status === "spawning") {
      waveElapsedTime += deltaTime;

      const remainingSpawns: SpawnRequest[] = [];
      const blueprints = world.getResource<any>("BlueprintRegistry");

      for (const spawn of pendingSpawns) {
        const spawnTime = spawn.spawnTime ?? 0;
        if (waveElapsedTime >= spawnTime) {
          // Time to spawn!
          const entityId = world.reserveEntityId();
          world.getCommandBuffer().createEntity(entityId);
          world.getCommandBuffer().spawnFromBlueprintForEntity(entityId, spawn.blueprintId as any, spawn.args as any);

          // Attach WaveMember component to identify it belongs to the wave
          world.getCommandBuffer().addComponent(entityId, {
            type: "WaveMember",
            waveIndex,
            waveId: activeWaveId || ""
          } as any);
        } else {
          remainingSpawns.push(spawn);
        }
      }

      pendingSpawns = remainingSpawns;

      if (pendingSpawns.length === 0) {
        status = "active";
      }
    }

    if (status === "active" && initialStatus === "active") {
      // Query remaining wave members
      const activeMembers = world.query("WaveMember" as any);
      enemiesRemaining = activeMembers.length;

      if (enemiesRemaining === 0) {
        status = "cooldown";
        const currentWave = waveDefinitions[waveIndex];
        cooldownRemaining = currentWave?.cooldown ?? 0;

        const eventBus = world.getEventBus() as EventBus;
        if (eventBus) {
          eventBus.emitDeferred("spawn:wave_complete", {
            waveIndex,
            waveId: activeWaveId || ""
          });
        }
      }
    }

    if (status === "cooldown") {
      cooldownRemaining -= deltaTime;
      if (cooldownRemaining <= 0) {
        waveIndex++;
        status = "idle";
        activeWaveId = undefined;
      }
    }

    // Mutate state back into director component
    world.mutateComponent(directorEntity, "SpawnDirector" as any, (d: any) => {
      d.waveIndex = waveIndex;
      d.status = status;
      d.cooldownRemaining = cooldownRemaining;
      d.waveElapsedTime = waveElapsedTime;
      d.pendingSpawns = pendingSpawns;
      d.activeWaveId = activeWaveId;
      d.enemiesRemaining = enemiesRemaining;
    });
  }
}
