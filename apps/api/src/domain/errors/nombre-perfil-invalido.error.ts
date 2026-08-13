/**
 * NombrePerfilInvalidoError — error de dominio.
 *
 * Se produce cuando el `nombre` recibido en `PATCH /api/perfil` no cumple la
 * forma esperada (trim + 1–80 caracteres). Mirrors
 * NombreCategoriaInvalidoError, con un máximo mayor (80 en vez de 40) porque
 * un nombre personal es más largo que una etiqueta de categoría — la columna
 * es un `String` sin límite (design.md §3.1, addition beyond the proposal).
 *
 * NO carga `rawValue` (a diferencia de `EmailInvalidoError`): PR#1 le dio
 * uno "para logging server-side" pero ningún call site lo loguea — el único
 * log de `ActualizarPerfilUseCase` ya sigue D-07 (booleanos/nombres de
 * campo, nunca valores). `nombre` es además PII en claro (ADR-013), así que
 * un futuro `logger.debug('…', {rawValue})` sería justo la fuga que D-07
 * prohíbe. Un campo "solo para logging" que nada loguea es dead code — se
 * saca, siguiendo el mismo criterio que `PasswordInvalidaError` (Phase 9).
 */
export class NombrePerfilInvalidoError extends Error {
  constructor() {
    super('El nombre debe tener entre 1 y 80 caracteres.');
    this.name = 'NombrePerfilInvalidoError';
  }
}
