import { Bucket } from '../../domain/value-objects/bucket';
import { PeriodoMes } from '../../domain/value-objects/periodo-mes';

/**
 * BucketSumRow — aggregated sums per budget bucket for a calendar month.
 *
 * The repository folds bucketId=null (uncategorized) into Bucket.SinCategoria
 * before returning rows to the use case. The use case receives only semantic
 * Bucket enum keys — never raw DB bucketId strings.
 *
 * Amounts stay BigInt — no number, no string at application layer.
 */
export interface BucketSumRow {
  readonly bucket: Bucket;
  readonly totalCargo: bigint;
  readonly totalAbono: bigint;
}

/**
 * IResumenMesReader — narrow port for the 50/30/20 monthly aggregation (US-015).
 *
 * Returns per-bucket BigInt sums for the given user and month.
 * Does NOT compute percentages — that is the use case's responsibility.
 * Does NOT import from infrastructure.
 */
export interface IResumenMesReader {
  sumarPorBucket(
    userId: string,
    periodo: PeriodoMes,
  ): Promise<ReadonlyArray<BucketSumRow>>;
}

/** Injection token — interfaces are erased at runtime; mirrors MOVIMIENTOS_MES_READER. */
export const RESUMEN_MES_READER = 'IResumenMesReader';
