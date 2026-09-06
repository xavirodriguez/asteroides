import { World } from "../ecs/World";
import { GameLoop } from "../loop/GameLoop";
import { EventBus, EventRegistry } from "../events/EventBus";
import { ComponentRegistry } from "../ecs/Component";
import { WorldSnapshot } from "../snapshots/WorldSnapshot";
import { CompactInputFrame } from "../input/InputFrame";
import { IGame } from "./IGame";
import { IInputSystem } from "../input/InputSystem";
import { NullInputSystem } from "../input/NullInputSystem";
import {
  enterGameplayFreeze,
  exitGameplayFreeze,
  isGameplayFrozen,
  getGameplayFreezeRemaining
} from "./GameplayFreezeMixin";

/**
 * Abstract Null Object base class providing trivial stubs for headless/mock minigame implementations.
 *
 * @typeParam TState - Game state payload type.
 * @typeParam TInput - Input action dictionary type.
 * @typeParam TComponents - Component registry type.
 * @typeParam TEvents - Event registry type.
 *
 * @public
 */
export abstract class NullBaseGame<
  TState = unknown,
  TInput extends Record<string, unknown> = Record<string, unknown>,
  TComponents extends ComponentRegistry = import("../ecs/CoreComponents").CoreComponentRegistry,
  TEvents extends EventRegistry = EventRegistry
> implements IGame<TState, TInput, TComponents, TEvents> {
  public get tick(): number { return 0; }
  public get state(): TState { return this.getGameState(); }

  public step(_input: CompactInputFrame): void {}

  public snapshot(): WorldSnapshot {
    return {
      tick: 0,
      entities: [],
      componentData: {},
      stateVersion: 0,
      structureVersion: 0,
      seed: 0,
      nextEntityId: 0,
      freeEntities: []
    } as unknown as WorldSnapshot;
  }

  public restore(_snapshot: WorldSnapshot): void {}

  public hash(): string { return "00000000"; }

  protected _world = new World<TComponents, TEvents>();
  protected _loop = new GameLoop();
  protected _eventBus = new EventBus<TEvents>();
  protected _inputSystem = new NullInputSystem<TInput>();

  public getWorld(): World<TComponents, TEvents> { return this._world; }
  public getGameLoop(): GameLoop { return this._loop; }
  public getEventBus(): EventBus<TEvents> { return this._eventBus; }
  public isPausedState(): boolean { return false; }
  public isGameOver(): boolean { return false; }

  public abstract getGameState(): TState;

  public getSeed(): number { return 0; }

  public async init(): Promise<void> {}
  public start(): void {}
  public stop(): void {}
  public pause(): void {}
  public resume(): void {}
  public async restart(): Promise<void> {}
  public destroy(): void {}

  public subscribe(_cb: (state: TState) => void): () => void {
    return () => {};
  }

  public initializeRenderer(): void {}

  public getInputSystem(): IInputSystem<TInput> {
    return this._inputSystem;
  }

  public setInputState(_input: Partial<TInput>): void {}

  public enterGameplayFreeze(duration?: number): void {
    enterGameplayFreeze(this._world, duration);
  }

  public exitGameplayFreeze(): void {
    exitGameplayFreeze(this._world);
  }

  public isGameplayFrozen(): boolean {
    return isGameplayFrozen(this._world);
  }

  public getGameplayFreezeRemaining(): number | undefined {
    return getGameplayFreezeRemaining(this._world);
  }
}
