/**
 * PasswordInvalidaError — error de dominio.
 *
 * Se produce cuando la `passwordNueva` recibida en `PATCH /api/perfil/password`
 * no cumple la regla de largo (8–128 caracteres, length-over-composition,
 * NIST 800-63B — design.md D-02). A DIFERENCIA de `EmailInvalidoError`, NO
 * conserva un `rawValue`: un email es PII pero no un secreto; una password
 * SÍ lo es, así que no hay valor legítimo en loguearla, ni siquiera
 * server-side.
 */
export class PasswordInvalidaError extends Error {
  constructor() {
    super('La contraseña debe tener entre 8 y 128 caracteres.');
    this.name = 'PasswordInvalidaError';
  }
}
