/**
 * PrioridadInvalidaError — error de dominio.
 *
 * Se produce cuando `prioridad` recibida al crear o actualizar un patrón no
 * es un entero en el rango `1..999`. `prioridad` es opcional y por defecto
 * `100` — este error solo aplica cuando el caller la envía y es inválida.
 * Ver design.md §5.2, CAT038-05.
 */
export class PrioridadInvalidaError extends Error {
  /** The original raw input, for server-side logging only. */
  readonly rawValue: number;

  constructor(raw: number) {
    super('La prioridad debe ser un número entero entre 1 y 999.');
    this.name = 'PrioridadInvalidaError';
    this.rawValue = raw;
  }
}
