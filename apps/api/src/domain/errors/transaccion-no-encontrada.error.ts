/**
 * TransaccionNoEncontradaError — error de dominio.
 *
 * Se produce cuando el `:id` de transacción recibido por el endpoint de
 * reclasificación manual (US-013, CATAPI-01) no existe, O existe pero
 * pertenece a otro usuario. Ambos casos se representan con este ÚNICO error
 * — nunca se distinguen — para que la respuesta HTTP no permita a un usuario
 * enumerar la existencia de transacciones ajenas (anti-enumeration, mirrors
 * the auth dummy-hash posture, RNF-SEC-006).
 */
export class TransaccionNoEncontradaError extends Error {
  /** The original transaction id, for server-side logging only. */
  readonly transaccionId: string;

  constructor(transaccionId: string) {
    super('La transacción no existe o no pertenece al usuario autenticado.');
    this.name = 'TransaccionNoEncontradaError';
    this.transaccionId = transaccionId;
  }
}
