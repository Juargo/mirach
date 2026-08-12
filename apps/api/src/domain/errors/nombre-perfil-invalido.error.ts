/**
 * NombrePerfilInvalidoError — error de dominio.
 *
 * Se produce cuando el `nombre` recibido en `PATCH /api/perfil` no cumple la
 * forma esperada (trim + 1–80 caracteres). Mirrors
 * NombreCategoriaInvalidoError, con un máximo mayor (80 en vez de 40) porque
 * un nombre personal es más largo que una etiqueta de categoría — la columna
 * es un `String` sin límite (design.md §3.1, addition beyond the proposal).
 */
export class NombrePerfilInvalidoError extends Error {
  /** The original raw input, for server-side logging only. Never include in HTTP responses. */
  readonly rawValue: string;

  constructor(raw: string) {
    super('El nombre debe tener entre 1 y 80 caracteres.');
    this.name = 'NombrePerfilInvalidoError';
    this.rawValue = raw;
  }
}
