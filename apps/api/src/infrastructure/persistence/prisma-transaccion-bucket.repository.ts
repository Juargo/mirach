import { Result } from '../../shared/result';
import { CategorizacionFallidaError } from '../../domain/errors/categorizacion-fallida.error';
import { ITransaccionBucketWriter } from '../../application/ports/transaccion-bucket-writer.port';
import { Bucket } from '../../domain/value-objects/bucket';
import { agruparPorCategoriaBucket } from '../../application/services/agrupar-por-categoria-bucket';
import type { PrismaClient } from '@prisma/client';
import { BUCKET_IDS } from './bucket-ids';

/**
 * PrismaTransaccionBucketRepository — implementación del port ITransaccionBucketWriter.
 *
 * Agrupa las asignaciones por (categoriaId, bucket) y emite un updateMany por
 * grupo dentro de un único prisma.$transaction, escribiendo `categoriaId` +
 * `bucketId` ATÓMICAMENTE en la misma fila (US-013, CAT-02: el bucket
 * escrito es siempre el que ya viene derivado de la categoría — nunca puede
 * quedar desincronizado entre las dos columnas). El mapeo Bucket → id físico
 * usa BUCKET_IDS (global, sin cambios).
 *
 * ADR-037/Q5: `asignaciones` ya trae el `categoriaId` REAL resuelto río
 * arriba (`CategorizarTransaccionUseCase`, contra el catálogo del usuario
 * clasificador) — este writer NO hace ningún lookup de categoría, ni mapa,
 * ni throw por "categoría no encontrada" (esa rama de código murió con el
 * enum). `userId`, ya sin uso en un lookup, queda LOAD-BEARING en el
 * `WHERE`: triple lock `id IN (…) AND ingestaId = ? AND account.userId = ?`,
 * cerrando en la escritura el residual que ADR-036 dejó documentado ("la FK
 * compuesta cierra el catálogo, no el lado de `Transaccion.categoriaId`").
 *
 * Contrato: retorna Result y NUNCA lanza. Array vacío → Result.ok({ actualizadas: 0 })
 * sin tocar la BD.
 */
export class PrismaTransaccionBucketRepository implements ITransaccionBucketWriter {
  constructor(private readonly prisma: PrismaClient) {}

  async asignarCategorizacion(
    userId: string,
    ingestaId: string,
    asignaciones: ReadonlyArray<{
      transaccionId: string;
      categoriaId: string | null;
      bucket: Bucket;
    }>,
  ): Promise<Result<{ actualizadas: number }, CategorizacionFallidaError>> {
    if (asignaciones.length === 0) {
      return Result.ok({ actualizadas: 0 });
    }

    try {
      // Agrupar por (categoriaId, bucket) para emitir un updateMany por
      // grupo (más eficiente y mantiene la atomicidad vía $transaction). Dos
      // categorías distintas que derivan al MISMO bucket (p.ej. Supermercado
      // y Combustible → Necesidades) deben seguir siendo grupos separados,
      // porque categoriaId difiere. Grouping es lógica pura compartida con
      // backfill-categorias.ts (DRY, ver agrupar-por-categoria-bucket.ts).
      const grupos = agruparPorCategoriaBucket(
        asignaciones.map(({ transaccionId, categoriaId, bucket }) => ({
          id: transaccionId,
          categoriaId,
          bucket,
        })),
      );

      // Triple-lock scope isolation (Q5): WHERE id IN (...) AND ingestaId = ?
      // AND account.userId = ? — un id malicioso o de otra ingesta/usuario
      // nunca puede colarse en esta escritura de dinero.
      const operaciones = grupos.map(
        ({ categoriaId, bucket, ids }) =>
          () =>
            this.prisma.transaccion.updateMany({
              where: { id: { in: ids }, ingestaId, account: { userId } },
              data: { categoriaId, bucketId: BUCKET_IDS[bucket] },
            }),
      );

      const resultados = await this.prisma.$transaction(
        operaciones.map((op) => op()),
      );

      const actualizadas = resultados.reduce(
        (sum: number, r: { count: number }) => sum + r.count,
        0,
      );

      return Result.ok({ actualizadas });
    } catch (error) {
      return Result.fail(
        new CategorizacionFallidaError(
          'no se pudieron asignar las categorizaciones a las transacciones',
          error instanceof Error ? error : undefined,
        ),
      );
    }
  }
}
