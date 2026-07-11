/**
 * PeriodoInvalidoError — error de dominio.
 *
 * Se produce cuando el período proporcionado no sigue el formato YYYY-MM
 * o está fuera del rango de meses válidos (1-12).
 * Es un error de dominio porque la validación del período es una regla
 * de negocio central de la consulta de movimientos consolidados.
 *
 * Design note: `message` is scrubbed — it does NOT contain the raw user input.
 * Raw user input is stored in `rawValue` for server-side logging only and MUST
 * NOT be forwarded to HTTP responses (prevents reflected-input in 400 bodies).
 */
export class PeriodoInvalidoError extends Error {
  /** The original raw input, for server-side logging only. Never include in HTTP responses. */
  readonly rawValue: string;

  constructor(raw: string) {
    super('El período no es válido. Formato esperado: YYYY-MM (ej: 2026-07).');
    this.name = 'PeriodoInvalidoError';
    this.rawValue = raw;
  }
}
