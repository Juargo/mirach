import {
  IResumenAnualReader,
  BucketSumRowAnual,
} from '../../application/ports/resumen-anual.port';
import { Bucket } from '../../domain/value-objects/bucket';
import { PeriodoAnio } from '../../domain/value-objects/periodo-anio';
import type { PrismaClient } from '@prisma/client';
import { BUCKET_ID_TO_BUCKET } from './bucket-ids';

/** "YYYY-MM" label for a UTC date, matching PeriodoMes.valor format. */
function mesLabel(fecha: Date): string {
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * PrismaResumenAnualRepository — aggregation repository for the 50/30/20
 * annual breakdown (US-030 Slice A).
 *
 * Fetches ALL of the year's transactions for the user in a SINGLE query
 * (`findMany`, filtered by the half-open [desde, hasta) year range and
 * structural `account: { userId }` isolation), then aggregates per
 * (month, bucket) in memory. This avoids 12 separate monthly round-trips
 * (N+1) while keeping the Prisma query itself simple — grouping by a
 * truncated date expression is not supported by Prisma's `groupBy` without
 * raw SQL, and for a single user's yearly transaction volume, one `findMany`
 * + in-memory reduce is simpler and safer (KISS) than hand-rolled raw SQL
 * with BigInt driver-serialization risk.
 *
 * Folds bucketId=null (and unrecognized bucketIds) into Bucket.SinCategoria —
 * mirrors PrismaResumenMesRepository's SC-03 fold rule (ADD, never overwrite).
 *
 * User isolation is structural: `account: { userId }` in the WHERE clause.
 * Amounts stay BigInt; no number, no float here.
 */
export class PrismaResumenAnualRepository implements IResumenAnualReader {
  constructor(private readonly prisma: PrismaClient) {}

  async sumarPorBucketAnual(
    userId: string,
    anio: PeriodoAnio,
  ): Promise<ReadonlyArray<BucketSumRowAnual>> {
    const transacciones = await this.prisma.transaccion.findMany({
      where: {
        account: { userId },                       // USER ISOLATION — structural
        fecha: { gte: anio.desde, lt: anio.hasta }, // half-open [desde, hasta)
      },
      select: { fecha: true, bucketId: true, cargo: true, abono: true },
    });

    // Pre-seed all 12 months × 5 buckets with 0n so empty months/buckets
    // always return a full set of rows (mirrors monthly repo's SC-05).
    const accum = new Map<
      string,
      { mes: string; bucket: Bucket; totalCargo: bigint; totalAbono: bigint }
    >();
    for (let mes = 1; mes <= 12; mes++) {
      const mesStr = `${anio.anio}-${String(mes).padStart(2, '0')}`;
      for (const bucket of Object.values(Bucket)) {
        accum.set(`${mesStr}|${bucket}`, {
          mes: mesStr,
          bucket,
          totalCargo: 0n,
          totalAbono: 0n,
        });
      }
    }

    for (const t of transacciones) {
      const mesStr = mesLabel(t.fecha);
      // Resolve physical bucketId → domain Bucket enum.
      // null bucketId → SinCategoria (degradation from US-012).
      // Unrecognized non-null bucketId → also SinCategoria (defensive).
      const bucket: Bucket =
        t.bucketId === null
          ? Bucket.SinCategoria
          : (BUCKET_ID_TO_BUCKET.get(t.bucketId) ?? Bucket.SinCategoria);

      const key = `${mesStr}|${bucket}`;
      const current = accum.get(key);
      if (current === undefined) {
        // Defensive: transaccion.fecha outside [desde, hasta) should never
        // reach here given the WHERE clause, but never overwrite silently.
        continue;
      }

      // CRITICAL: ADD into accumulator — do NOT overwrite (same rule as
      // PrismaResumenMesRepository SC-03).
      accum.set(key, {
        ...current,
        totalCargo: current.totalCargo + t.cargo,
        totalAbono: current.totalAbono + t.abono,
      });
    }

    return Array.from(accum.values());
  }
}
