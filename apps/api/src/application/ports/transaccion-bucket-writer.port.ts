import { Result } from '../../shared/result';
import { CategorizacionFallidaError } from '../../domain/errors/categorizacion-fallida.error';
import { Bucket } from '../../domain/value-objects/bucket';
import { Categoria } from '../../domain/value-objects/categoria';

/**
 * ITransaccionBucketWriter — port de aplicación (escritura de categoría + bucket).
 *
 * Asigna en bloque la categoría y el bucket clasificados a las transacciones ya
 * persistidas. Se mantiene separado de IIngestaRepository para que la atomicidad
 * de la persistencia y la categorización estén desacopladas (Approach B del diseño).
 *
 * US-013 (CAT-02): `categoriaId` y `bucketId` se escriben ATÓMICAMENTE por fila
 * — el bucket es siempre el derivado de la categoría (nunca un valor
 * independiente), así el invariante nunca puede quedar a medio escribir.
 *
 * La implementación Prisma agrupa las asignaciones por (categoria, bucket) y
 * emite un updateMany por grupo dentro de un prisma.$transaction.
 *
 * Contrato: retorna Result y NUNCA lanza. Array vacío → ok({ actualizadas: 0 }).
 */
export interface ITransaccionBucketWriter {
  /**
   * @param ingestaId - Scope lock: only rows belonging to this ingesta will be
   *   updated, even if `asignaciones` contains foreign ids. This is structural
   *   isolation, not just a convention — the WHERE clause enforces both
   *   `id IN (...)` AND `ingestaId = ?` at the DB level.
   */
  asignarCategorizacion(
    ingestaId: string,
    asignaciones: ReadonlyArray<{
      transaccionId: string;
      categoria: Categoria | null;
      bucket: Bucket;
    }>,
  ): Promise<Result<{ actualizadas: number }, CategorizacionFallidaError>>;
}

/** Token de inyección — las interfaces se borran en runtime. */
export const TRANSACCION_BUCKET_WRITER = 'ITransaccionBucketWriter';
