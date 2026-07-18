/**
 * CredencialesInvalidasError — error de dominio.
 *
 * El único error genérico que retorna `LoginUseCase` para TODAS las ramas
 * de fallo: email desconocido, formato de email inválido, o contraseña
 * incorrecta (AUTH-02 — no enumeración). El mensaje es intencionalmente
 * genérico y nunca distingue el caso real, para no filtrar si un email existe.
 */
export class CredencialesInvalidasError extends Error {
  constructor() {
    super('Credenciales inválidas.');
    this.name = 'CredencialesInvalidasError';
  }
}
