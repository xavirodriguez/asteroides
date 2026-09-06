import { Packr } from "msgpackr";
import { ServerUpdatePayload } from "./NetTypes";
import { WorldSnapshot } from "../snapshots/WorldSnapshot";
import { World } from "../ecs/World";
import { System } from "../ecs/System";
import { ComponentRegistry } from "../ecs/Component";
import { EventRegistry } from "../events/EventBus";

const packr = new Packr({
    useRecords: false,
    structuredClone: true
});

/** @public */
export class ReplicationStateTracker {}
/** @public */
export class ClientAckTracker {
    public recordAck(sessionId: string, sequence: number, tick: number): void {}
    public nextSequence(sessionId: string): number { return 0; }
    public getLastAckedSequence(sessionId: string): number { return 0; }
    public getIdleTime(sessionId: string): number { return 0; }
}
/** @public */
export class NetworkDeltaSystem<
  TComponents extends ComponentRegistry = ComponentRegistry,
  TEvents extends EventRegistry = EventRegistry
> {
    constructor(tracker: ReplicationStateTracker) {}
    public generateDelta(
        world: World<TComponents, TEvents>,
        sessionId: string,
        sequence: number,
        baselineAck: number,
        interestIds: Set<number>,
        forceFull: boolean
    ): ServerUpdatePayload {
        return {
            kind: "delta",
            tick: 0,
            delta: {} as Partial<WorldSnapshot>
        };
    }
}
/** @public */
export class NetworkBudgetManager {
    public prioritize<T = unknown>(sessionId: string, interest: T[], _selfEntityId?: string): T[] { return interest; }
}
/** @public */
export class BinaryCompression {
    public static pack(packet: unknown): Uint8Array {
        return packr.pack(packet);
    }
    public static unpack<T = unknown>(packet: Uint8Array | ArrayBuffer | Buffer): T {
        const buf = packet instanceof Uint8Array ? packet : new Uint8Array(packet);
        return packr.unpack(buf) as T;
    }
}

/** @public */
export class InterestManagerSystem<
  TComponents extends ComponentRegistry = ComponentRegistry,
  TEvents extends EventRegistry = EventRegistry
> extends System<TComponents, TEvents> {
    public update(world: World<TComponents, TEvents>, deltaTime: number): void {}
    public override onRegister(world: World<TComponents, TEvents>): void {}
    public override dispose(): void {}
}
