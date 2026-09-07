import { Result } from '../../shared/result';
import { CategorizacionFallidaError } from '../../domain/errors/categorizacion-fallida.error';
import { Bucket } from '../../domain/value-objects/bucket';

/**
 * IReevaluarCategoriasWriter — port de escritura para
 * `POST /api/transacciones/reevaluar`.
 *
 * Escribe en bloque `categoriaId` + `bucketId` para las filas cuya
 * clasificación cambió (el use case ya filtró: solo llegan asignaciones
 * "determinadas" — nunca `Bucket.SinCategoria` — y solo las que difieren del
 * valor actual). Mirrors `ITransaccionBucketWriter` (US-013) pero SIN el
 * scope de `ingestaId`: el `WHERE` de la implementación es
 * `{ id IN (...), account: { userId } }` — alcance TODO el historial del
 * usuario, no una ingesta puntual.
 *
 * Contrato: retorna Result y NUNCA lanza. Array vacío → ok({ actualizadas: 0 })
 * sin tocar la BD. La implementación agrupa por (categoriaId, bucket) y
 * escribe en lotes acotados (nunca N updates sueltos ni un único statement
 * gigante — ver docstring de `PrismaReevaluarCategoriasWriter`).
 */
export interface IReevaluarCategoriasWriter {
  escribir(
    userId: string,
    asignaciones: ReadonlyArray<{
      transaccionId: string;
      categoriaId: string | null;
      bucket: Bucket;
    }>,
  ): Promise<Result<{ actualizadas: number }, CategorizacionFallidaError>>;
}

/** Token de inyección — las interfaces se borran en runtime. */
export const REEVALUAR_CATEGORIAS_WRITER = 'IReevaluarCategoriasWriter';
