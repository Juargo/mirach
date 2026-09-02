/**
 * NombreCategoriaDuplicadoError — error de dominio.
 *
 * Se produce cuando `nombre` colisiona, case-insensitively, con otra
 * categoría del MISMO usuario DENTRO DEL MISMO BUCKET (ADR-042 — antes era
 * por usuario únicamente) al crear, o al actualizar excluyendo la propia
 * fila. Ver design.md D-03/D-12, CAT038-01/03.
 */
export class NombreCategoriaDuplicadoError extends Error {
  /** The original raw nombre, for server-side logging only. */
  readonly rawValue: string;

  constructor(raw: string) {
    super('Ya existe una categoría con ese nombre en ese bucket.');
    this.name = 'NombreCategoriaDuplicadoError';
    this.rawValue = raw;
  }
}
