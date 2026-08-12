/**
 * PatronInvalidoError — error de dominio.
 *
 * Se produce cuando el `patron` recibido al crear o actualizar un patrón de
 * clasificación no cumple la forma esperada (trim + 1–200 caracteres). Ver
 * design.md §5.2, CAT038-05.
 */
export class PatronInvalidoError extends Error {
  /** The original raw input, for server-side logging only. Never include in HTTP responses. */
  readonly rawValue: string;

  constructor(raw: string) {
    super('El patrón debe tener entre 1 y 200 caracteres.');
    this.name = 'PatronInvalidoError';
    this.rawValue = raw;
  }
}
