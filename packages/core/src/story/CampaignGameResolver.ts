import { BaseGame } from "../runtime/BaseGame";

/**
 * Registry mapping gameplay identifiers to `BaseGame` factory constructors.
 *
 * @public
 */
export type CampaignGameFactory = (options?: Record<string, unknown>) => BaseGame;

/**
 * Resolver mapping game string IDs to `BaseGame` factory constructors.
 *
 * @public
 */
export class CampaignGameResolver {
  private static factories: Record<string, CampaignGameFactory> = {};

  /**
   * Registers or overrides a factory constructor for a game ID.
   *
   * @param gameId - Gameplay string identifier.
   * @param factory - Factory function returning a new `BaseGame` instance.
   */
  public static registerGame(gameId: string, factory: CampaignGameFactory): void {
    this.factories[gameId.toLowerCase()] = factory;
  }

  /**
   * Resolves and instantiates a `BaseGame` subclass for the provided game ID.
   *
   * @param gameId - Gameplay string identifier.
   * @param options - Game configuration options passed to constructor.
   * @returns Instantiated `BaseGame` subclass.
   * @throws Error if `gameId` is unrecognized.
   */
  public static resolveGame(gameId: string, options?: Record<string, unknown>): BaseGame {
    const key = gameId.toLowerCase();
    const factory = this.factories[key];
    if (!factory) {
      throw new Error(`Unknown campaign gameId: "${gameId}". Available games: ${Object.keys(this.factories).join(", ")}`);
    }
    return factory(options);
  }
}
