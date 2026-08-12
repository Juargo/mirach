/**
 * NombreCategoriaInvalidoError — error de dominio.
 *
 * Se produce cuando el `nombre` recibido al crear o renombrar una categoría
 * no cumple la forma esperada (trim + 1–40 caracteres). Ver design.md §5.2,
 * CAT038-01/03.
 */
export class NombreCategoriaInvalidoError extends Error {
  /** The original raw input, for server-side logging only. Never include in HTTP responses. */
  readonly rawValue: string;

  constructor(raw: string) {
    super('El nombre de la categoría debe tener entre 1 y 40 caracteres.');
    this.name = 'NombreCategoriaInvalidoError';
    this.rawValue = raw;
  }
}
