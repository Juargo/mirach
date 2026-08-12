/**
 * MatchTypeInvalidoError — error de dominio.
 *
 * Se produce cuando el `matchType` recibido no es uno de
 * `CONTAINS`/`STARTS_WITH`/`REGEX`. Primer punto de escritura del repo que
 * valida este campo (design.md §5.2, CAT038-05).
 */
export class MatchTypeInvalidoError extends Error {
  /** The original raw input, for server-side logging only. */
  readonly rawValue: string;

  constructor(raw: string) {
    super(
      'El tipo de coincidencia debe ser uno de: CONTAINS, STARTS_WITH, REGEX.',
    );
    this.name = 'MatchTypeInvalidoError';
    this.rawValue = raw;
  }
}
