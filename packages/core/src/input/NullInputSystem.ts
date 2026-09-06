import { IInputSystem } from "./InputSystem";

/**
 * Lightweight null implementation of `IInputSystem` for headless or default test environments.
 *
 * @remarks
 * Does not emit deprecation warnings or maintain input mappings. Serves as a safe default
 * input handler when no explicit `inputSystem` configuration is supplied to `BaseGame`.
 *
 * @typeParam TInput - Input action dictionary type.
 * @public
 */
export class NullInputSystem<TInput extends Record<string, unknown> = Record<string, unknown>> implements IInputSystem<TInput> {
  private overrides: Record<string, boolean> = {};

  /**
   * Sets a manual override for a specific input action.
   *
   * @param action - The action identifier string.
   * @param pressed - Whether the action is active.
   */
  public setOverride(action: keyof TInput & string, pressed: boolean): void {
    this.overrides[action] = pressed;
  }

  /**
   * Clears a manual input action override.
   *
   * @param action - The action identifier string.
   */
  public clearOverride(action: keyof TInput & string): void {
    delete this.overrides[action];
  }

  /**
   * Returns whether an input action is currently active.
   *
   * @param action - The action identifier string.
   * @returns `true` if active, `false` otherwise.
   */
  public getAction(action: keyof TInput & string): boolean {
    return !!this.overrides[action];
  }

  /**
   * No-op bind implementation.
   *
   * @param _action - Action identifier string.
   * @param _keys - Array of key codes.
   */
  public bind(_action: keyof TInput & string, _keys: string[]): void {}

  /**
   * Optional cleanup method.
   */
  public dispose(): void {
    this.overrides = {};
  }
}
