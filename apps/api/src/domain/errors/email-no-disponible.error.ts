/**
 * EmailNoDisponibleError — error de dominio.
 *
 * Retornado ÚNICAMENTE por `IUserCredentialRepository.actualizarPerfil` (el
 * puerto, capa infrastructure) cuando el `UPDATE` colisiona con la
 * restricción `@unique` de `emailBlindIndex` (P2002 dirigido — design.md
 * §4.2). Este error NUNCA cruza el boundary HTTP: `ActualizarPerfilUseCase`
 * lo colapsa siempre al `PerfilRechazadoError` genérico (D-04,
 * anti-enumeración PERF040-04) — por eso `ActualizarPerfilError` (el tipo de
 * error público del use case) no lo incluye.
 */
export class EmailNoDisponibleError extends Error {
  constructor() {
    super('El email ya está en uso por otra cuenta.');
    this.name = 'EmailNoDisponibleError';
  }
}
