import { World, TransformComponent, RenderComponent, TTLComponent, Juice, Entity } from "@tiny-aster/core";

/**
 * Spawns a floating score or combo popup text at (x, y) coordinates.
 * Animates the text upwards and fades it out using the engine's Juice system.
 *
 * @param world The ECS world.
 * @param x The horizontal screen/world coordinate.
 * @param y The vertical screen/world coordinate.
 * @param text The text content to display.
 * @param color The text color (default: "#FFFF00").
 * @public
 */
export function spawnScorePopup(
  world: World<any>,
  x: number,
  y: number,
  text: string,
  color: string = "#FFFF00"
): Entity {
  const isUpdating = world.isUpdating;
  const commands = world.getCommandBuffer();

  let popup: Entity;
  if (isUpdating) {
    popup = world.reserveEntityId();
    commands.createEntity(popup);
  } else {
    popup = world.createEntity();
  }

  const addComp = (comp: any) => {
    if (isUpdating) {
      commands.addComponent(popup, comp);
    } else {
      world.addComponent(popup, comp);
    }
  };

  addComp({
    type: "Transform",
    x,
    y: y - 20,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    worldX: x,
    worldY: y - 20,
    worldRotation: 0,
    worldScaleX: 1,
    worldScaleY: 1,
    dirty: false
  } as TransformComponent);

  addComp({
    type: "Render",
    spriteId: "text",
    shape: "floating_text",
    color,
    visible: true,
    opacity: 1,
    order: 100,
    rotation: 0,
    angularVelocity: 0,
    hitFlashFrames: 0,
    data: { content: text }
  } as unknown as RenderComponent);

  // If the game registry supports UIText, we also attach it
  addComp({
    type: "UIText",
    content: text,
    wordWrap: false,
    maxLines: 1
  } as any);

  addComp({
    type: "TTL",
    timeLeft: 1000,
    remaining: 1000
  } as TTLComponent);

  addComp({
    type: "Juice",
    active: true,
    animations: [
      { type: "animation", property: "y", target: -40, duration: 1.0, delay: 0, elapsed: 0, easing: "easeOut" },
      { type: "animation", property: "opacity", target: 0, duration: 1.0, delay: 0, elapsed: 0, easing: "easeIn" }
    ]
  });

  addComp({
    type: "VisualOffset",
    offsetX: 0,
    offsetY: 0,
    scaleX: 1,
    scaleY: 1
  });

  return popup;
}
