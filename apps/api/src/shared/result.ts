/**
 * Result<T, E> — manejo funcional de errores.
 *
 * Evita lanzar excepciones en la capa de dominio y application.
 * Los use cases retornan Result en lugar de throw.
 *
 * Uso:
 *   const r = Result.ok(value);
 *   const r = Result.fail(new Error('mensaje'));
 *   if (r.isOk()) { r.getValue() }
 *   if (r.isFail()) { r.getError() }
 */
export class Result<T, E extends Error = Error> {
  private constructor(
    private readonly _ok: boolean,
    private readonly _value?: T,
    private readonly _error?: E,
  ) {}

  static ok<T>(value: T): Result<T, never> {
    return new Result<T, never>(true, value);
  }

  static fail<E extends Error>(error: E): Result<never, E> {
    return new Result<never, E>(false, undefined, error);
  }

  isOk(): this is Result<T, never> {
    return this._ok;
  }

  isFail(): this is Result<never, E> {
    return !this._ok;
  }

  getValue(): T {
    if (!this._ok) {
      throw new Error('Cannot get value of a failed Result');
    }
    return this._value as T;
  }

  getError(): E {
    if (this._ok) {
      throw new Error('Cannot get error of a successful Result');
    }
    return this._error as E;
  }
}
