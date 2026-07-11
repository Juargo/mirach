import { Result } from '../../shared/result';
import { CategorizacionFallidaError } from '../../domain/errors/categorizacion-fallida.error';
import { Bucket } from '../../domain/value-objects/bucket';

/**
 * ITransaccionBucketWriter — port de aplicación (escritura de buckets).
 *
 * Asigna en bloque los buckets clasificados a las transacciones ya persistidas.
 * Se mantiene separado de IIngestaRepository para que la atomicidad de la
 * persistencia y la categorización estén desacopladas (Approach B del diseño).
 *
 * La implementación Prisma (PR-B) agrupa las asignaciones por bucket y emite
 * un updateMany por grupo dentro de un prisma.$transaction.
 *
 * Contrato: retorna Result y NUNCA lanza. Array vacío → ok({ actualizadas: 0 }).
 */
export interface ITransaccionBucketWriter {
  asignarBuckets(
    asignaciones: ReadonlyArray<{ transaccionId: string; bucket: Bucket }>,
  ): Promise<Result<{ actualizadas: number }, CategorizacionFallidaError>>;
}

/** Token de inyección — las interfaces se borran en runtime. */
export const TRANSACCION_BUCKET_WRITER = 'ITransaccionBucketWriter';
