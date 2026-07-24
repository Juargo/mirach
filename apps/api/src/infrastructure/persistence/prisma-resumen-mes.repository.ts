import {
  IResumenMesReader,
  BucketSumRow,
} from '../../application/ports/resumen-mes.port';
import { Bucket } from '../../domain/value-objects/bucket';
import { PeriodoMes } from '../../domain/value-objects/periodo-mes';
import type { PrismaClient } from '@prisma/client';
import { BUCKET_ID_TO_BUCKET } from './bucket-ids';

/**
 * PrismaResumenMesRepository — aggregation repository for the 50/30/20 breakdown.
 *
 * Implements IResumenMesReader. Uses Prisma groupBy to sum cargo/abono per
 * bucket in a single DB query. Folds bucketId=null (and unrecognized bucketIds)
 * into Bucket.SinCategoria — BOTH a null group AND a real SinCategoria group
 * can coexist and MUST be added, never overwritten (SC-03, highest-risk).
 *
 * User isolation is structural: `account: { userId }` in the WHERE clause.
 * Amounts stay BigInt; no number, no float here.
 *
 * Depende de `PrismaClient` (base), no de `PrismaService` (artefacto Nest) — así
 * el composition root de Express le pasa un cliente plano (ADR-028).
 */
export class PrismaResumenMesRepository implements IResumenMesReader {
  constructor(private readonly prisma: PrismaClient) {}

  async sumarPorBucket(
    userId: string,
    periodo: PeriodoMes,
  ): Promise<ReadonlyArray<BucketSumRow>> {
    const grupos = await this.prisma.transaccion.groupBy({
      by: ['bucketId'],
      where: {
        account: { userId },                              // USER ISOLATION — structural
        fecha: { gte: periodo.desde, lt: periodo.hasta }, // half-open [desde, hasta)
      },
      _sum: { cargo: true, abono: true },
    });

    // Initialize accumulator with 0n for ALL 5 buckets so empty months
    // always return a full set of rows.
    const accum = new Map<Bucket, { totalCargo: bigint; totalAbono: bigint }>(
      Object.values(Bucket).map((bucket) => [
        bucket,
        { totalCargo: 0n, totalAbono: 0n },
      ]),
    );

    for (const grupo of grupos) {
      // Resolve physical bucketId → domain Bucket enum.
      // null bucketId → SinCategoria (degradation from US-012).
      // Unrecognized non-null bucketId → also SinCategoria (defensive).
      const bucket: Bucket =
        grupo.bucketId === null
          ? Bucket.SinCategoria
          : (BUCKET_ID_TO_BUCKET.get(grupo.bucketId) ?? Bucket.SinCategoria);

      const cargo = grupo._sum.cargo ?? 0n;
      const abono = grupo._sum.abono ?? 0n;

      // CRITICAL: ADD into accumulator — do NOT overwrite.
      // Both a bucketId=null group AND a bucket-sincategoria group can coexist
      // in the same Prisma groupBy result, and both must contribute to the sum.
      const current = accum.get(bucket)!;
      accum.set(bucket, {
        totalCargo: current.totalCargo + cargo,
        totalAbono: current.totalAbono + abono,
      });
    }

    // Return all 5 bucket rows (including Ingreso — use case reads Ingreso.totalAbono as base)
    return Array.from(accum.entries()).map(([bucket, sums]) => ({
      bucket,
      totalCargo: sums.totalCargo,
      totalAbono: sums.totalAbono,
    }));
  }
}
