/**
 * SesionInvalidaError — error de dominio.
 *
 * Retornado por `ValidarSesionUseCase` cuando el token de sesión está
 * ausente, no coincide con ningún hash almacenado (desconocido/manipulado),
 * o la sesión encontrada ya expiró (AUTH-05, AUTH-06). No distingue entre
 * estos casos — todos se tratan como "sesión ausente".
 */
export class SesionInvalidaError extends Error {
  constructor() {
    super('Sesión inválida o expirada.');
    this.name = 'SesionInvalidaError';
  }
}
