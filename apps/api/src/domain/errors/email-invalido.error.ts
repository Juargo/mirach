/**
 * EmailInvalidoError — error de dominio.
 *
 * Se produce cuando el email proporcionado no cumple el formato esperado
 * (tras trim + lowercase). Mirrors PeriodoInvalidoError/BucketInvalidoError:
 * `message` is scrubbed — it does NOT contain the raw user input.
 *
 * Design note (auth-login-session): `LoginUseCase` maps this internally into
 * `CredencialesInvalidasError` — an invalid email format must never surface
 * as a distinct error from "unknown email" (no enumeration, AUTH-02).
 */
export class EmailInvalidoError extends Error {
  /** The original raw input, for server-side logging only. Never include in HTTP responses. */
  readonly rawValue: string;

  constructor(raw: string) {
    super('El email no tiene un formato válido.');
    this.name = 'EmailInvalidoError';
    this.rawValue = raw;
  }
}
