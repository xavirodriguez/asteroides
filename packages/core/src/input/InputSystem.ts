/**
 * Interface representing a strongly-typed input system.
 * @public
 */
export interface IInputSystem<TInput extends Record<string, unknown>> {
  /**
   * Manually sets an input action state.
   */
  setOverride(action: keyof TInput & string, pressed: boolean): void;

  /**
   * Clears a manual input action override.
   */
  clearOverride(action: keyof TInput & string): void;

  /**
   * Returns the state of an action.
   */
  getAction(action: keyof TInput & string): boolean;

  /**
   * Binds raw input keys to a logical action.
   */
  bind(action: keyof TInput & string, keys: string[]): void;

  /**
   * Optional cleanup method.
   */
  dispose?(): void;
}

/**
 * Interface representing an input system.
 * @public
 */
export type InputSystem = IInputSystem<Record<string, unknown>>;
