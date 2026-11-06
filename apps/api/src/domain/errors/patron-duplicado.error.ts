import type { PatronExistente } from '../value-objects/patron-existente';

/**
 * PatronDuplicadoError — error de dominio.
 *
 * Se produce cuando `patron` colisiona con otro patrón del mismo usuario (al
 * crear, o al actualizar excluyendo la propia fila). La comparación pliega
 * mayúsculas y tildes ("cafe" choca con "café", CLA-17). Ver design.md §5.2,
 * CAT038-05.
 *
 * `existente` (CLA-17) es el patrón que ya tiene ese texto, con su categoría
 * y bucket, para que el cliente ofrezca moverlo. `null` cuando el caller no
 * lo conoce.
 */
export class PatronDuplicadoError extends Error {
  /** The original raw patron, for server-side logging only. */
  readonly rawValue: string;
  readonly existente: PatronExistente | null;

  constructor(raw: string, existente: PatronExistente | null = null) {
    super('Ya existe un patrón con ese texto.');
    this.name = 'PatronDuplicadoError';
    this.rawValue = raw;
    this.existente = existente;
  }
}
