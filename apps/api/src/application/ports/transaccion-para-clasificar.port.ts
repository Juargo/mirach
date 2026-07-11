/**
 * TransaccionParaClasificar — proyección mínima de una transacción persistida
 * que necesita la categorización (US-012).
 *
 * Solo los campos que requieren `CategorizarTransaccionUseCase` + el id persistido
 * para la escritura de bucket. No expone datos sensibles adicionales.
 */
export interface TransaccionParaClasificar {
  readonly id: string;
  readonly descripcion: string;
  readonly cargo: bigint;
  readonly abono: bigint;
}

/**
 * ITransaccionParaClasificarReader — port de lectura mínimo para el paso de
 * categorización post-persistencia.
 *
 * Lee los ids + campos de clasificación de las transacciones ya persistidas
 * de una Ingesta. Un SELECT puntual por ingestaId, ejecutado UNA vez después
 * del commit atómico. Separado de ITransaccionRepository para no acoplar la
 * lectura de clasificación a la firma de dominio completa.
 *
 * Contrato: retorna siempre un array (vacío si no hay filas). NUNCA lanza.
 */
export interface ITransaccionParaClasificarReader {
  findParaClasificar(
    ingestaId: string,
  ): Promise<ReadonlyArray<TransaccionParaClasificar>>;
}

/** Token de inyección — las interfaces se borran en runtime. */
export const TRANSACCION_PARA_CLASIFICAR_READER = 'ITransaccionParaClasificarReader';
