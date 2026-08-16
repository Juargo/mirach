import {
  IResumenMesReader,
  BucketSumRow,
} from '../../application/ports/resumen-mes.port';
import { Bucket } from '../../domain/value-objects/bucket';
import { PeriodoMes } from '../../domain/value-objects/periodo-mes';
import type { PrismaClient } from '@prisma/client';
import { BUCKET_ID_TO_BUCKET } from './bucket-ids';

/**
 * Resolve a physical Prisma bucketId → domain Bucket enum.
 * null bucketId → SinCategoria (degradation from US-012).
 * Unrecognized non-null bucketId → also SinCategoria (defensive).
 *
 * Shared by BOTH the sums fold and the cantidadCargos fold (US-045 D-05) —
 * a single resolver is the structural mitigation for the "null-bucket and
 * real SinCategoria groups must ADD, never overwrite" rule (SC-03): if each
 * loop re-implemented this mapping, one could silently drift from the other.
 */
function resolverBucket(bucketId: string | null): Bucket {
  return bucketId === null
    ? Bucket.SinCategoria
    : (BUCKET_ID_TO_BUCKET.get(bucketId) ?? Bucket.SinCategoria);
}

/**
 * PrismaResumenMesRepository — aggregation repository for the 50/30/20 breakdown.
 *
 * Implements IResumenMesReader. Uses Prisma groupBy to sum cargo/abono per
 * bucket, plus a second scoped groupBy to count cargo-only rows (US-045
 * D-05), both batched in one `$transaction` array-form call (one snapshot
 * for both queries). Folds bucketId=null (and unrecognized bucketIds) into
 * Bucket.SinCategoria — BOTH a null group AND a real SinCategoria group can
 * coexist and MUST be added, never overwritten (SC-03, highest-risk), now
 * for counts too.
 *
 * User isolation is structural: `account: { userId }` in the WHERE clause.
 * Amounts stay BigInt; no number, no float here. `cantidadCargos` is a plain
 * `number` — a row count, not money (D-03).
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
    // ONE where object, built once and reused via spread below — the two
    // queries MUST never diverge on user isolation or period bounds.
    const where = {
      account: { userId }, // USER ISOLATION — structural
      fecha: { gte: periodo.desde, lt: periodo.hasta }, // half-open [desde, hasta)
    };

    // Two aggregations: `cargo: { gt: 0 }` is added ONLY to the count
    // query's where. Adding it to the sums query would silently drop
    // uncategorized abono rows from totalAbono — the income base for the
    // whole 50/30/20 calculation (US-045 R-2, proven by SC-10).
    //
    // FALLBACK NOTE (design §7 checkpoint): `prisma.$transaction([groupBy,
    // groupBy])` array-form does NOT type-check here — mixing a `_sum`
    // groupBy and a `_count` groupBy in one tuple confuses Prisma 7's
    // overload resolution (both calls get widened to an incompatible
    // intersection type). Falling back to `Promise.all`, per the design's
    // documented fallback. Correctness cost: a same-user concurrent-ingest
    // write landing between the two reads could produce a count momentarily
    // inconsistent with the sums — not a correctness invariant (single
    // user's own concurrent write), acceptable per D-05.
    const [gruposSuma, gruposCargo] = await Promise.all([
      this.prisma.transaccion.groupBy({
        by: ['bucketId'],
        where,
        _sum: { cargo: true, abono: true },
      }),
      this.prisma.transaccion.groupBy({
        by: ['bucketId'],
        where: { ...where, cargo: { gt: 0 } }, // CARGOS ONLY — count scope
        _count: { _all: true },
      }),
    ]);

    // Initialize accumulator with 0n/0 for ALL 5 buckets so empty months
    // always return a full set of rows.
    const accum = new Map<
      Bucket,
      { totalCargo: bigint; totalAbono: bigint; cantidadCargos: number }
    >(
      Object.values(Bucket).map((bucket) => [
        bucket,
        { totalCargo: 0n, totalAbono: 0n, cantidadCargos: 0 },
      ]),
    );

    for (const grupo of gruposSuma) {
      const bucket = resolverBucket(grupo.bucketId);
      const cargo = grupo._sum.cargo ?? 0n;
      const abono = grupo._sum.abono ?? 0n;

      // CRITICAL: ADD into accumulator — do NOT overwrite.
      // Both a bucketId=null group AND a bucket-sincategoria group can coexist
      // in the same Prisma groupBy result, and both must contribute to the sum.
      const current = accum.get(bucket)!;
      accum.set(bucket, {
        ...current,
        totalCargo: current.totalCargo + cargo,
        totalAbono: current.totalAbono + abono,
      });
    }

    for (const grupo of gruposCargo) {
      const bucket = resolverBucket(grupo.bucketId);

      // CRITICAL: ADD into accumulator — do NOT overwrite. Same rule as the
      // sums fold above, now applied to counts (US-045 SC-03 extended).
      const current = accum.get(bucket)!;
      accum.set(bucket, {
        ...current,
        cantidadCargos: current.cantidadCargos + grupo._count._all,
      });
    }

    // Return all 5 bucket rows (including Ingreso — use case reads Ingreso.totalAbono as base)
    return Array.from(accum.entries()).map(([bucket, sums]) => ({
      bucket,
      totalCargo: sums.totalCargo,
      totalAbono: sums.totalAbono,
      cantidadCargos: sums.cantidadCargos,
    }));
  }
}
