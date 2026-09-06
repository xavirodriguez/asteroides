import { World, CoreComponentRegistry } from "@tiny-aster/core";

export interface PlatformerInputPartial {
  moveLeft?: boolean;
  moveRight?: boolean;
  jump?: boolean;
  dash?: boolean;
  pulse?: boolean;
}

/**
 * Mutates the PlatformerInput component on the active player entity.
 *
 * @public
 */
export function mutatePlatformerInputState(
  world: World<CoreComponentRegistry, any, any>,
  input: PlatformerInputPartial
): void {
  const playerEntity = world.query("PlatformerInput")[0];
  if (playerEntity !== undefined) {
    world.mutateComponent(playerEntity, "PlatformerInput", (inputComp: any) => {
      const left = input.moveLeft !== undefined ? !!input.moveLeft : (inputComp._moveLeft ?? (inputComp.moveDir === -1));
      const right = input.moveRight !== undefined ? !!input.moveRight : (inputComp._moveRight ?? (inputComp.moveDir === 1));
      inputComp._moveLeft = left;
      inputComp._moveRight = right;
      inputComp.moveDir = left ? -1 : (right ? 1 : 0);

      if (input.jump !== undefined) {
        inputComp.jumpHeld = !!input.jump;
      }
      if (input.dash !== undefined) {
        inputComp.dash = !!input.dash;
      }
      if (input.pulse !== undefined) {
        inputComp.pulsePressed = !!input.pulse;
      }
    });
  }
}
