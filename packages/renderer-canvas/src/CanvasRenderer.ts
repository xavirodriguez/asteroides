import { World, Renderer, CoreComponentRegistry, Entity, ShapeDrawer, EffectDrawer, ShapeType, RenderComponent, TransformComponent, ColliderComponent, Camera2DComponent, VisualOffsetComponent, SceneManager, SceneState } from "@tiny-aster/core";
import { CanvasCircleDrawer, CanvasBoxDrawer, CanvasPolygonDrawer } from "./CanvasShapeDrawers";
import { CanvasSpriteDrawer } from "./CanvasSpriteDrawer";

/**
 * Basic 2D Canvas renderer.
 */
export class CanvasRenderer<TRegistry extends CoreComponentRegistry = CoreComponentRegistry> implements Renderer<TRegistry, CanvasRenderingContext2D> {
  private sortedEntities: Entity[] = [];
  public readonly type = "canvas";
  private readonly backgroundEffects: Map<string, EffectDrawer<CanvasRenderingContext2D, TRegistry>> = new Map();

  constructor(
    private readonly shapeDrawers: Map<string, ShapeDrawer<CanvasRenderingContext2D, TRegistry>> = new Map()
  ) {
    // Pre-populate default shape drawers if not already present
    if (!this.shapeDrawers.has("sprite")) {
      this.shapeDrawers.set("sprite", new CanvasSpriteDrawer<TRegistry>());
    }
    if (!this.shapeDrawers.has("Circle")) {
      this.shapeDrawers.set("Circle", new CanvasCircleDrawer());
    }
    if (!this.shapeDrawers.has("circle")) {
      this.shapeDrawers.set("circle", new CanvasCircleDrawer());
    }
    if (!this.shapeDrawers.has("Box")) {
      this.shapeDrawers.set("Box", new CanvasBoxDrawer());
    }
    if (!this.shapeDrawers.has("box")) {
      this.shapeDrawers.set("box", new CanvasBoxDrawer());
    }
    if (!this.shapeDrawers.has("Polygon")) {
      this.shapeDrawers.set("Polygon", new CanvasPolygonDrawer());
    }
    if (!this.shapeDrawers.has("polygon")) {
      this.shapeDrawers.set("polygon", new CanvasPolygonDrawer());
    }
  }

  public registerShape(name: string, drawer: ShapeDrawer<CanvasRenderingContext2D, TRegistry>): void {
    this.shapeDrawers.set(name, drawer);
  }

  public registerBackgroundEffect(name: string, drawer: EffectDrawer<CanvasRenderingContext2D, TRegistry>): void {
    this.backgroundEffects.set(name, drawer);
  }

  public render(world: World<TRegistry>, ctx: CanvasRenderingContext2D): void {
    const sceneManager = world.getResource<SceneManager>("SceneManager");
    if (sceneManager) {
      const state = sceneManager.getState();
      if (state === SceneState.UNLOADING || state === SceneState.LOADING) {
        const progress = sceneManager.transitionProgress;
        const effect = sceneManager.getActiveTransitionEffect();
        let options = sceneManager.getTransitionOptions();

        const drawsBoth = effect?.drawsBothScenes === true;

        if (drawsBoth) {
          const oldScene = sceneManager.getTransitionOldScene();
          const newScene = sceneManager.getTransitionNewScene();
          if (newScene) {
            this.renderWorld(newScene.getWorld() as unknown as World<TRegistry>, ctx);
          } else {
            this.renderWorld(world, ctx);
          }
          if (oldScene) {
            // Render old scene onto offscreen canvas for the transition effect
            const canvas = ctx.canvas;
            if (canvas) {
              // We need an offscreen canvas. We can get it via a simple dynamic creation helper
              // or let's create a local offscreen canvas inside CanvasRenderer as a helper
              const off = this.getOffscreen(canvas.width, canvas.height);
              const octx = off.getContext("2d");
              if (octx) {
                octx.clearRect(0, 0, off.width, off.height);
                this.renderWorld(oldScene.getWorld() as unknown as World<TRegistry>, octx);
                if (!options) {
                  options = {};
                }
                options = { ...options, offscreenCanvas: off as unknown as CanvasImageSource };
              }
            }
          }
          if (effect) {
            effect.render(ctx, progress, options);
          }
          return;
        }

        if (progress <= 0.5) {
          const oldScene = sceneManager.getTransitionOldScene();
          if (oldScene) {
            this.renderWorld(oldScene.getWorld() as unknown as World<TRegistry>, ctx);
          } else {
            this.renderWorld(world, ctx);
          }
        } else {
          const newScene = sceneManager.getTransitionNewScene();
          if (newScene) {
            this.renderWorld(newScene.getWorld() as unknown as World<TRegistry>, ctx);
          } else {
            this.renderWorld(world, ctx);
          }
        }

        if (effect) {
          effect.render(ctx, progress, options);
        }
        return;
      }
    }

    this.renderWorld(world, ctx);
  }

  private _offscreenCanvas: { width: number; height: number; getContext(type: "2d"): CanvasRenderingContext2D | null } | null = null;

  private getOffscreen(width: number, height: number): { width: number; height: number; getContext(type: "2d"): CanvasRenderingContext2D | null } {
    if (typeof document === "undefined") {
      return { width, height, getContext: () => null };
    }
    if (!this._offscreenCanvas) {
      this._offscreenCanvas = document.createElement("canvas") as unknown as { width: number; height: number; getContext(type: "2d"): CanvasRenderingContext2D | null };
    }
    if (this._offscreenCanvas.width !== width || this._offscreenCanvas.height !== height) {
      this._offscreenCanvas.width = width;
      this._offscreenCanvas.height = height;
    }
    return this._offscreenCanvas;
  }

  private renderWorld(world: World<TRegistry>, ctx: CanvasRenderingContext2D): void {
    const canvas = ctx.canvas;

    const screenConfig = world.getResource<{ width: number; height: number }>("ScreenConfig");
    if (screenConfig) {
      if (canvas.width !== screenConfig.width) {
        canvas.width = screenConfig.width;
      }
      if (canvas.height !== screenConfig.height) {
        canvas.height = screenConfig.height;
      }
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background effects first (e.g. scrolling skies)
    for (const drawer of this.backgroundEffects.values()) {
      drawer.draw(ctx, world);
    }

    const cameraType = "Camera2D" as Extract<keyof TRegistry, string>;
    const transformType = "Transform" as Extract<keyof TRegistry, string>;
    const renderType = "Render" as Extract<keyof TRegistry, string>;
    const colliderType = "Collider" as Extract<keyof TRegistry, string>;

    const cameras = world.query(cameraType);
    let mainCameraEntity: Entity | undefined;

    for (let i = 0; i < cameras.length; i++) {
      const cam = world.getComponent(cameras[i], cameraType) as Camera2DComponent | undefined;
      if (cam?.isMain) {
        mainCameraEntity = cameras[i];
        break;
      }
    }

    const entities = world.query(transformType, renderType);

    if (this.sortedEntities.length !== entities.length) {
      this.sortedEntities = [...entities];
    } else {
      for (let i = 0; i < entities.length; i++) {
        this.sortedEntities[i] = entities[i];
      }
    }

    this.sortedEntities.sort((a, b) => {
      const renderA = world.getComponent(a, renderType) as RenderComponent | undefined;
      const renderB = world.getComponent(b, renderType) as RenderComponent | undefined;
      return (renderA?.order || 0) - (renderB?.order || 0);
    });

    ctx.save();                          // ← save de cámara (NUEVO)

    if (mainCameraEntity !== undefined) {
      const cam = world.getComponent(mainCameraEntity, cameraType) as Camera2DComponent | undefined;
      if (cam) {
        ctx.translate(-cam.x, -cam.y);
        ctx.scale(cam.zoom, cam.zoom);

        const visualOffsetType = "VisualOffset" as Extract<keyof TRegistry, string>;
        const visualOffset = world.getComponent(mainCameraEntity, visualOffsetType) as VisualOffsetComponent | undefined;
        if (visualOffset) {
          ctx.translate(-visualOffset.offsetX, -visualOffset.offsetY);
        }
      }
    }

    for (const entity of this.sortedEntities) {
      const render = world.getComponent(entity, renderType) as RenderComponent | undefined;
      const transform = world.getComponent(entity, transformType) as TransformComponent | undefined;

      if (!render || !render.visible || render.opacity === 0) continue;
      if (!transform) continue;

      ctx.save();

      const visualOffsetType = "VisualOffset" as Extract<keyof TRegistry, string>;
      const visualOffset = world.getComponent(entity, visualOffsetType) as unknown as { offsetX: number; offsetY: number; scaleX?: number; scaleY?: number } | undefined;
      const offsetX = visualOffset?.offsetX ?? 0;
      const offsetY = visualOffset?.offsetY ?? 0;
      const visualScaleX = visualOffset?.scaleX ?? 1;
      const visualScaleY = visualOffset?.scaleY ?? 1;

      const x = transform.worldX ?? transform.x;
      const y = transform.worldY ?? transform.y;
      const rotation = (transform.worldRotation ?? transform.rotation ?? 0) + (render.rotation ?? 0);
      const scaleX = transform.worldScaleX ?? transform.scaleX ?? 1;
      const scaleY = transform.worldScaleY ?? transform.scaleY ?? 1;

      ctx.translate(x + offsetX, y + offsetY);
      ctx.rotate(rotation);
      ctx.scale(scaleX * visualScaleX, scaleY * visualScaleY);
      ctx.globalAlpha = render.opacity;

      const drawColor = render.color || "white";
      ctx.fillStyle = drawColor;
      ctx.strokeStyle = drawColor;

      // 1. Try custom registered shape drawer
      const customDrawer = render.shape ? this.shapeDrawers.get(render.shape) : undefined;
      if (customDrawer) {
        customDrawer.draw(ctx, world, entity);
      } else {
        // 2. Try default collider shape drawer
        const collider = world.getComponent(entity, colliderType) as ColliderComponent | undefined;
        if (collider && collider.enabled) {
          const shapeTypeStr = ShapeType[collider.shape.type];
          const drawer = this.shapeDrawers.get(shapeTypeStr);
          if (drawer) {
            drawer.draw(ctx, world, entity);
          }
        } else {
          // 3. Draw fallback circle
          ctx.beginPath();
          ctx.arc(0, 0, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();
    }

    ctx.restore();                       // ← restore de cámara (NUEVO)
  }
}
