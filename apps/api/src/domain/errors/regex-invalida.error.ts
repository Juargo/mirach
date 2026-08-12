/**
 * RegexInvalidaError — error de dominio.
 *
 * Se produce cuando `patron` con `matchType: REGEX` no compila
 * (`new RegExp(patron)` lanza) al crear o actualizar un patrón. Es un gate
 * de escritura MÁS TEMPRANO y amigable — nunca reemplaza el `try/catch` de
 * `coincide()`, que sigue degradando cualquier REGEX malformada preexistente
 * a no-match (CA-05). Ver design.md D-03, §5.2, CAT038-06.
 */
export class RegexInvalidaError extends Error {
  /** The original raw pattern, for server-side logging only. Never include in HTTP responses. */
  readonly rawValue: string;

  constructor(raw: string) {
    super('La expresión regular no es válida.');
    this.name = 'RegexInvalidaError';
    this.rawValue = raw;
  }
}
