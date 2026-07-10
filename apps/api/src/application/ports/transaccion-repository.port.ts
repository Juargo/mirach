import { Transaccion } from '../../domain/value-objects/transaccion';

/**
 * ITransaccionRepository — port de aplicación (lado de lectura).
 *
 * Complementa a IIngestaRepository (que posee la escritura atómica). Se usa
 * para leer las transacciones ya persistidas de una Ingesta (tests de
 * integración y consultas de US-014). La implementación Prisma llega en PR3.
 */
export interface ITransaccionRepository {
  findByIngesta(ingestaId: string): Promise<ReadonlyArray<Transaccion>>;
}

/** Token de inyección — las interfaces se borran en runtime. */
export const TRANSACCION_REPOSITORY = 'ITransaccionRepository';
