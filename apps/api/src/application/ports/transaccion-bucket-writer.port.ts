import { Result } from '../../shared/result';
import { CategorizacionFallidaError } from '../../domain/errors/categorizacion-fallida.error';
import { Bucket } from '../../domain/value-objects/bucket';

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
 * La implementación Prisma agrupa las asignaciones por (categoriaId, bucket) y
 * emite un updateMany por grupo dentro de un prisma.$transaction.
 *
 * Contrato: retorna Result y NUNCA lanza. Array vacío → ok({ actualizadas: 0 }).
 */
export interface ITransaccionBucketWriter {
  /**
   * @param userId - ADR-037/Q5: `asignaciones` ya trae el `categoriaId` REAL
   *   resuelto contra el catálogo del usuario clasificador — no hay lookup
   *   que hacer aquí. `userId` se retiene y es LOAD-BEARING: el `WHERE` del
   *   `updateMany` lo suma como triple lock (`id IN (…) AND ingestaId = ?
   *   AND account.userId = ?`), cerrando en la escritura el residual de
   *   ADR-036 ("la FK compuesta cierra el catálogo, no el lado de
   *   `Transaccion.categoriaId`").
   * @param ingestaId - Scope lock: only rows belonging to this ingesta will be
   *   updated, even if `asignaciones` contains foreign ids. This is structural
   *   isolation, not just a convention — the WHERE clause enforces both
   *   `id IN (...)` AND `ingestaId = ?` at the DB level.
   */
  asignarCategorizacion(
    userId: string,
    ingestaId: string,
    asignaciones: ReadonlyArray<{
      transaccionId: string;
      categoriaId: string | null;
      bucket: Bucket;
    }>,
  ): Promise<Result<{ actualizadas: number }, CategorizacionFallidaError>>;
}

/** Token de inyección — las interfaces se borran en runtime. */
export const TRANSACCION_BUCKET_WRITER = 'ITransaccionBucketWriter';
