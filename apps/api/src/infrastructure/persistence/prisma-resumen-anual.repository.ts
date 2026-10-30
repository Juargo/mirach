import {
  IResumenAnualReader,
  BucketSumRowAnual,
} from '../../application/ports/resumen-anual.port';
import { Bucket } from '../../domain/value-objects/bucket';
import { PeriodoAnio } from '../../domain/value-objects/periodo-anio';
import { PeriodoMes } from '../../domain/value-objects/periodo-mes';
import { DiaCorte } from '../../domain/value-objects/mes-financiero';
import type { PrismaClient } from '@prisma/client';
import { resolverBucket } from './bucket-ids';

/**
 * "YYYY-MM" financial month of a row (#111): income credits keep the 3-day
 * tolerance (`queContieneIngreso`), every other row uses its own date. With
 * cut-off 1 both are the UTC calendar month of `fecha`.
 */
function mesLabel(fecha: Date, bucket: Bucket, diaCorte: DiaCorte): string {
  return bucket === Bucket.Ingreso
    ? PeriodoMes.queContieneIngreso(fecha, diaCorte).valor
    : PeriodoMes.queContiene(fecha, diaCorte).valor;
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
 * Folds bucketId=null AND any unrecognized bucketId (integrity anomaly —
 * `Bucket.SinCategoria` no longer exists in the domain, issue #778 tramo 5b)
 * into `Bucket.Deseos` via `resolverBucket` (see bucket-ids.ts docblock) — mirrors
 * PrismaResumenMesRepository's SC-03 fold rule: within each of the 4 real
 * bucket groups, ADD, never overwrite.
 *
 * User isolation is structural: `account: { userId }` in the WHERE clause.
 * Amounts stay BigInt; no number, no float here.
 */
export class PrismaResumenAnualRepository implements IResumenAnualReader {
  constructor(private readonly prisma: PrismaClient) {}

  async sumarPorBucketAnual(
    userId: string,
    anio: PeriodoAnio,
    diaCorte: DiaCorte,
  ): Promise<ReadonlyArray<BucketSumRowAnual>> {
    // The financial year spans the 12 financial months (#111): from the
    // income window of January to the end of December's period. Rows of the
    // edges that belong to another year are skipped by the `accum` guard.
    const meses = anio.meses(diaCorte);
    const transacciones = await this.prisma.transaccion.findMany({
      where: {
        account: { userId }, // USER ISOLATION — structural
        fecha: { gte: meses[0].ingresoDesde, lt: meses[11].hasta }, // half-open
      },
      select: { fecha: true, bucketId: true, cargo: true, abono: true },
    });

    // Pre-seed all 12 months × 4 buckets with 0n so empty months/buckets
    // always return a full set of rows (mirrors monthly repo's SC-05).
    const accum = new Map<
      string,
      {
        mes: string;
        bucket: Bucket;
        totalCargo: bigint;
        totalAbono: bigint;
        cantidadCargos: number;
      }
    >();
    for (let mes = 1; mes <= 12; mes++) {
      const mesStr = `${anio.anio}-${String(mes).padStart(2, '0')}`;
      for (const bucket of Object.values(Bucket)) {
        accum.set(`${mesStr}|${bucket}`, {
          mes: mesStr,
          bucket,
          totalCargo: 0n,
          totalAbono: 0n,
          cantidadCargos: 0,
        });
      }
    }

    for (const t of transacciones) {
      const bucket: Bucket = resolverBucket(t.bucketId);
      const mesStr = mesLabel(t.fecha, bucket, diaCorte);

      const key = `${mesStr}|${bucket}`;
      const current = accum.get(key);
      if (current === undefined) {
        // A row of the fetched edges that belongs to the previous or next
        // financial year (#111) — or, defensively, any fecha outside the
        // year: skip it, never overwrite silently.
        continue;
      }

      // CRITICAL: ADD into accumulator — do NOT overwrite (same rule as
      // PrismaResumenMesRepository SC-03, now including cantidadCargos —
      // US-045 D-07). No new query: cargo > 0n is evaluated in memory
      // against rows already fetched by the single findMany above.
      accum.set(key, {
        ...current,
        totalCargo: current.totalCargo + t.cargo,
        totalAbono: current.totalAbono + t.abono,
        cantidadCargos: current.cantidadCargos + (t.cargo > 0n ? 1 : 0),
      });
    }

    return Array.from(accum.values());
  }
}
