import { World } from "../ecs/World";
import { Entity } from "../ecs/Entity";
import { RenderComponent, JuiceComponent, CoreComponentRegistry, ScreenShakeComponent } from "../ecs/CoreComponents";

/**
 * Static utility for applying juice effects (squash, stretch, shake, flash).
 * Works in tandem with the JuiceSystem.
 * @public
 */
export class Juice {
  /**
   * Adds a temporary color flash to an entity.
   */
  public static flash(world: World<CoreComponentRegistry>, entity: Entity, frames: number = 5): void {
    world.mutateComponent(entity, "Render", (render: RenderComponent) => {
      render.hitFlashFrames = frames;
    });
  }

  /**
   * Shakes the screen (world singleton Camera2D if available, or ScreenShake resource).
   */
  public static shake(world: World<CoreComponentRegistry>, intensity: number, duration: number): void {
    const shake = world.getSingleton("ScreenShake");
    if (shake) {
        world.mutateSingleton("ScreenShake", (s: ScreenShakeComponent) => {
            s.intensity = Math.max(s.intensity, intensity);
            s.duration = Math.max(s.duration, duration);
            s.remaining = Math.max(s.remaining, duration);
        });
    } else {
        // Fallback to resource-based shake if component not found
        const res = world.getResource<{intensity: number, duration: number, remaining: number}>("ScreenShake");
        if (res) {
            res.intensity = Math.max(res.intensity, intensity);
            res.duration = Math.max(res.duration, duration);
            res.remaining = Math.max(res.remaining, duration);
        }
    }
  }

  /**
   * Adds a general juice animation to an entity.
   */
  public static add(world: World<CoreComponentRegistry>, entity: Entity, anim: {
    property: string;
    target: number;
    duration: number;
    easing?: string;
    delay?: number;
    repeat?: number;
  }): void {
    if (!world.hasComponent(entity, "Juice")) {
        world.addComponent(entity, { type: "Juice", active: true, animations: [] });
    }
    if (!world.hasComponent(entity, "VisualOffset")) {
        world.addComponent(entity, { type: "VisualOffset", offsetX: 0, offsetY: 0 } as import("../ecs/CoreComponents").VisualOffsetComponent);
    }

    const durationInSeconds = anim.duration / 1000;
    const delayInSeconds = anim.delay ? anim.delay / 1000 : 0;

    world.mutateComponent(entity, "Juice", (juice: JuiceComponent) => {
        juice.animations.push({
            type: "animation",
            ...anim,
            duration: durationInSeconds,
            delay: delayInSeconds,
            elapsed: 0
        });
    });
  }

  /**
   * Simple squash and stretch animation.
   */
  public static squash(world: World<CoreComponentRegistry>, entity: Entity, sx: number, sy: number, duration: number): void {
    this.add(world, entity, {
        property: "scaleX",
        target: sx,
        duration: duration / 2,
        easing: "easeOut"
    });
    this.add(world, entity, {
        property: "scaleX",
        target: 1,
        duration: duration / 2,
        delay: duration / 2,
        easing: "elasticOut"
    });
    this.add(world, entity, {
        property: "scaleY",
        target: sy,
        duration: duration / 2,
        easing: "easeOut"
    });
    this.add(world, entity, {
        property: "scaleY",
        target: 1,
        duration: duration / 2,
        delay: duration / 2,
        easing: "elasticOut"
    });
  }
}
