/**
 * IngestaNoEncontradaError — error de dominio.
 *
 * Se produce cuando el `:id` de ingesta recibido por
 * `DELETE /api/ingestas/:id` (US-018, ING-02) no existe, O existe pero
 * pertenece a otro usuario. Ambos casos se representan con este ÚNICO error
 * — nunca se distinguen — para que la respuesta HTTP no permita a un usuario
 * enumerar la existencia de ingestas ajenas (anti-enumeration, mirrors
 * TransaccionNoEncontradaError, RNF-SEC-006).
 */
export class IngestaNoEncontradaError extends Error {
  /** The original ingesta id, for server-side logging only. */
  readonly ingestaId: string;

  constructor(ingestaId: string) {
    super('La cartola no existe o no pertenece al usuario autenticado.');
    this.name = 'IngestaNoEncontradaError';
    this.ingestaId = ingestaId;
  }
}
