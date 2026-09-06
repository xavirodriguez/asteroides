import { z } from "zod";

/**
 * Schema for specifying assets.
 * @public
 */
export const AssetDescriptorSchema = z.object({
  id: z.string(),
  path: z.unknown(),
  type: z.enum(["image", "audio", "font", "texture", "json"])
});

/**
 * Descriptor for a single asset to be loaded.
 * @public
 */
export type AssetDescriptor = z.infer<typeof AssetDescriptorSchema>;

/** @public */
export interface IAssetProvider {
  loadImage(path: string | unknown): Promise<unknown>;
  loadAudio(path: string | unknown): Promise<unknown>;
  loadFont(path: string | unknown): Promise<unknown>;
  load?(path: string | unknown): Promise<unknown>;
}

/**
 * Platform-agnostic coordinator for asset loading and caching.
 *
 * @remarks
 * This class delegates the actual loading of platform-specific resources
 * (e.g. browser `Image` or React Native assets) to an injected `IAssetProvider`.
 * It provides a unified interface for queuing and retrieving loaded assets.
 *
 * @warning
 * **Resource Management**: The `AssetLoader` caches resources indefinitely.
 * Manual clearing may be required for long-running sessions to prevent
 * excessive memory usage.
 * @public
 */
export class AssetLoader {
  private cache = new Map<string, unknown>();
  private queue: AssetDescriptor[] = [];

  constructor(private provider?: IAssetProvider) {}

  public setProvider(provider: IAssetProvider) {
    this.provider = provider;
  }

  public hasProvider(): boolean {
    return this.provider !== undefined;
  }

  public queueAssets(assets: AssetDescriptor[]) {
    for (const asset of assets) {
      AssetDescriptorSchema.parse(asset);
    }
    this.queue.push(...assets);
  }

  public async load(assets: AssetDescriptor[]): Promise<void> {
    for (const asset of assets) {
      AssetDescriptorSchema.parse(asset);
    }

    if (!this.provider) {
      throw new Error("AssetLoader: no provider registered. Call setProvider() before load()");
    }

    const promises = assets.map(async asset => {
      if (this.cache.has(asset.id)) return;

      let loadedAsset: unknown;
      switch (asset.type) {
        case "image":
        case "texture":
          loadedAsset = await this.provider!.loadImage(asset.path);
          break;
        case "audio":
          loadedAsset = await this.provider!.loadAudio(asset.path);
          break;
        case "font":
          loadedAsset = await this.provider!.loadFont(asset.path);
          break;
        case "json":
          if (this.provider!.load) {
            loadedAsset = await this.provider!.load(asset.path);
          }
          break;
      }
      this.cache.set(asset.id, loadedAsset);
    });

    await Promise.all(promises);
  }

  public async loadAll(): Promise<void> {
    if (this.queue.length === 0) return;
    await this.load(this.queue);
    this.queue = [];
  }

  /**
   * Parses TexturePacker (Hash/Array) or Aseprite frame atlas JSON and registers frame sub-regions.
   *
   * @param atlasJson - The parsed JSON descriptor from TexturePacker or Aseprite.
   * @returns Map of frame names to source rectangle sub-regions (`{ x, y, w, h }`).
   */
  public parseAtlas(atlasJson: unknown): Map<string, { x: number; y: number; w: number; h: number }> {
    const framesMap = new Map<string, { x: number; y: number; w: number; h: number }>();
    if (!atlasJson || typeof atlasJson !== "object") return framesMap;

    const rawObj = atlasJson as Record<string, unknown>;
    const rawFrames = rawObj.frames;
    if (Array.isArray(rawFrames)) {
      // TexturePacker Array format or Aseprite array format
      for (const item of rawFrames) {
        if (item && typeof item === "object") {
          const frameObj = item as { filename?: string; frame?: { x: number; y: number; w: number; h: number } };
          if (frameObj.filename && frameObj.frame) {
            const { x, y, w, h } = frameObj.frame;
            framesMap.set(frameObj.filename, { x, y, w, h });
          }
        }
      }
    } else if (rawFrames && typeof rawFrames === "object") {
      // TexturePacker Hash format or Aseprite object format
      for (const [filename, item] of Object.entries(rawFrames as Record<string, unknown>)) {
        if (item && typeof item === "object") {
          const frameObj = item as { frame?: { x: number; y: number; w: number; h: number } };
          if (frameObj.frame) {
            const { x, y, w, h } = frameObj.frame;
            framesMap.set(filename, { x, y, w, h });
          }
        }
      }
    }

    return framesMap;
  }

  public get<T>(id: string): T {
    return this.cache.get(id) as T;
  }
}
