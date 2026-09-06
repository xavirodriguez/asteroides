import { World } from "../ecs/World";
import { System } from "../ecs/System";
import { NetworkManager } from "./NetworkManager";
import {
    MultiplayerRegistry,
    IInterpolationModel,
    RemoteInterpolationOptions,
    ExponentialSmoothingModel
} from "./types";

/**
 * System responsible for visual interpolation (LERP) on Remote Players.
 * Runs in SystemPhase.Presentation phase.
 *
 * @public
 */
export class RemoteInterpolationSystem<TRegistry extends MultiplayerRegistry = MultiplayerRegistry> extends System<TRegistry> {
    private interpolationModel: IInterpolationModel<TRegistry>;
    private queryComponents: Extract<keyof TRegistry, string>[];

    /**
     * Constructs a RemoteInterpolationSystem with options object or legacy positional parameters.
     *
     * @param networkManager - The network manager instance.
     * @param smoothingFactorOrOptions - Smoothing factor number or RemoteInterpolationOptions configuration object.
     * @param queryComponents - Legacy positional query components array.
     */
    constructor(
        private networkManager: NetworkManager<TRegistry>,
        smoothingFactorOrOptions?: number | RemoteInterpolationOptions<TRegistry>,
        queryComponents?: Extract<keyof TRegistry, string>[]
    ) {
        super();
        if (typeof smoothingFactorOrOptions === "object" && smoothingFactorOrOptions !== null) {
            const options = smoothingFactorOrOptions;
            this.interpolationModel = options.interpolationModel ?? new ExponentialSmoothingModel<TRegistry>(options.smoothingFactor ?? 0.15);
            this.queryComponents = options.queryComponents ?? options.interpolationModel?.queryComponents ?? ["Transform" as Extract<keyof TRegistry, string>, "RemotePlayer" as Extract<keyof TRegistry, string>];
        } else {
            const smoothingFactor = typeof smoothingFactorOrOptions === "number" ? smoothingFactorOrOptions : 0.15;
            this.interpolationModel = new ExponentialSmoothingModel<TRegistry>(smoothingFactor);
            this.queryComponents = queryComponents ?? this.interpolationModel.queryComponents ?? ["Transform" as Extract<keyof TRegistry, string>, "RemotePlayer" as Extract<keyof TRegistry, string>];
        }
    }

    public update(world: World<TRegistry>, deltaTime: number): void {
        const remoteQuery = world.query(...this.queryComponents);
        const qLen = remoteQuery.length;
        for (let i = 0; i < qLen; i++) {
            const entity = remoteQuery[i];
            const remote = world.getComponent(entity, "RemotePlayer" as Extract<keyof TRegistry, string>) as unknown as { targetX?: number; targetY?: number; targetRotation?: number } | undefined;
            if (remote && (remote.targetX !== undefined || remote.targetY !== undefined)) {
                this.interpolationModel.interpolate(world, entity, remote, deltaTime);
            }
        }
    }

    public override onRegister(_world: World<TRegistry>): void {}
    public override dispose(): void {}
}
