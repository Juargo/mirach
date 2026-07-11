import { Result } from '../../shared/result';
import { CategorizacionFallidaError } from '../../domain/errors/categorizacion-fallida.error';
import { ITransaccionBucketWriter } from '../../application/ports/transaccion-bucket-writer.port';
import { Bucket } from '../../domain/value-objects/bucket';
import { PrismaService } from './prisma.service';
import { BUCKET_IDS } from './bucket-ids';

/**
 * PrismaTransaccionBucketRepository — implementación del port ITransaccionBucketWriter.
 *
 * Agrupa las asignaciones por bucket y emite un updateMany por grupo dentro de
 * un único prisma.$transaction. El mapeo Bucket enum → id físico usa BUCKET_IDS
 * (single-sourced con el seed) para garantizar integridad de FK.
 *
 * Contrato: retorna Result y NUNCA lanza. Array vacío → Result.ok({ actualizadas: 0 })
 * sin tocar la BD.
 */
export class PrismaTransaccionBucketRepository implements ITransaccionBucketWriter {
  constructor(private readonly prisma: PrismaService) {}

  async asignarBuckets(
    ingestaId: string,
    asignaciones: ReadonlyArray<{ transaccionId: string; bucket: Bucket }>,
  ): Promise<Result<{ actualizadas: number }, CategorizacionFallidaError>> {
    if (asignaciones.length === 0) {
      return Result.ok({ actualizadas: 0 });
    }

    try {
      // Agrupar por bucket para emitir un updateMany por grupo (más eficiente
      // y mantiene la atomicidad vía $transaction).
      const porBucket = new Map<Bucket, string[]>();
      for (const { transaccionId, bucket } of asignaciones) {
        const ids = porBucket.get(bucket) ?? [];
        ids.push(transaccionId);
        porBucket.set(bucket, ids);
      }

      // Double-lock scope isolation (RNF-SEC-006): WHERE id IN (...) AND ingestaId = ?
      // ensures a bad id list can never bleed into another ingesta's rows.
      const operaciones = Array.from(porBucket.entries()).map(
        ([bucket, ids]) =>
          () =>
            this.prisma.transaccion.updateMany({
              where: { id: { in: ids }, ingestaId },
              data: { bucketId: BUCKET_IDS[bucket] },
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
          'no se pudieron asignar los buckets a las transacciones',
          error instanceof Error ? error : undefined,
        ),
      );
    }
  }
}
