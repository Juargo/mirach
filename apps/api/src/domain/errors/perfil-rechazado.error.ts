/**
 * PerfilRechazadoError — error de dominio.
 *
 * El único rechazo genérico que retornan `ActualizarPerfilUseCase` y
 * `CambiarPasswordUseCase` para TODAS las ramas que no deben ser
 * distinguibles entre sí (design.md D-04, PERF040-03/04): contraseña actual
 * incorrecta, `passwordActual` ausente en un cambio de email, email ya
 * tomado por otra cuenta, y el llamador sin `passwordHash` (usuario
 * solo-Google). Un mensaje fijo, sin ningún input interpolado — mismo
 * patrón que `CredencialesInvalidasError` en login.
 */
export class PerfilRechazadoError extends Error {
  constructor() {
    super('No pudimos actualizar tu perfil. Revisá los datos ingresados.');
    this.name = 'PerfilRechazadoError';
  }
}
