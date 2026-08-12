/**
 * PatronDuplicadoError — error de dominio.
 *
 * Se produce cuando `patron` colisiona, case-insensitively, con otro patrón
 * del mismo usuario (al crear, o al actualizar excluyendo la propia fila).
 * Ver design.md §5.2, CAT038-05.
 */
export class PatronDuplicadoError extends Error {
  /** The original raw patron, for server-side logging only. */
  readonly rawValue: string;

  constructor(raw: string) {
    super('Ya existe un patrón con ese texto.');
    this.name = 'PatronDuplicadoError';
    this.rawValue = raw;
  }
}
