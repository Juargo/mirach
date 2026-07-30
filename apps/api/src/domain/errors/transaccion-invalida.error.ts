/**
 * TransaccionInvalidaError — error de dominio.
 *
 * Se produce cuando los valores de una transacción violan un invariante del
 * negocio: montos negativos, fila sin montos, o cargo y abono simultáneos
 * (una línea de cartola es débito XOR crédito, nunca ambos). Al ser el dinero
 * `BigInt`, "no entero" es imposible por construcción y no es un motivo.
 *
 * Design note: el `message` está scrubbed — NO contiene los montos crudos.
 * El dinero es un dato sensible (ADR-013) y no debe filtrarse a logs ni a
 * respuestas HTTP. Solo se reporta la categoría del problema vía `motivo`.
 */
export type MotivoTransaccionInvalida =
  | 'MONTO_NEGATIVO'
  | 'SIN_MONTOS'
  | 'CARGO_Y_ABONO';

export class TransaccionInvalidaError extends Error {
  readonly motivo: MotivoTransaccionInvalida;

  constructor(motivo: MotivoTransaccionInvalida) {
    super('Los valores de la transacción no son válidos.');
    this.name = 'TransaccionInvalidaError';
    this.motivo = motivo;
  }
}
