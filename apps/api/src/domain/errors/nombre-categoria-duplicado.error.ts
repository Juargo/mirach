/**
 * NombreCategoriaDuplicadoError — error de dominio.
 *
 * Se produce cuando `nombre` colisiona, case-insensitively, con otra
 * categoría del mismo usuario (al crear, o al actualizar excluyendo la
 * propia fila). Ver design.md §5.2, CAT038-01/03.
 */
export class NombreCategoriaDuplicadoError extends Error {
  /** The original raw nombre, for server-side logging only. */
  readonly rawValue: string;

  constructor(raw: string) {
    super('Ya existe una categoría con ese nombre.');
    this.name = 'NombreCategoriaDuplicadoError';
    this.rawValue = raw;
  }
}
