/**
 * AnioInvalidoError — error de dominio.
 *
 * Se produce cuando el año proporcionado para el resumen anual no es un
 * entero o está fuera del rango de años válidos [2000, 2100].
 * Mirrors PeriodoInvalidoError — error de dominio porque la validación del
 * año es una regla de negocio central de la consulta de resumen anual.
 *
 * Design note: `message` is scrubbed — it does NOT contain the raw user input.
 * Raw user input is stored in `rawValue` for server-side logging only and MUST
 * NOT be forwarded to HTTP responses (prevents reflected-input in 400 bodies).
 */
export class AnioInvalidoError extends Error {
  /** The original raw input, for server-side logging only. Never include in HTTP responses. */
  readonly rawValue: number;

  constructor(raw: number) {
    super('El año no es válido. Debe ser un entero entre 2000 y 2100.');
    this.name = 'AnioInvalidoError';
    this.rawValue = raw;
  }
}
