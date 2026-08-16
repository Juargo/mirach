import { Bucket } from '../../domain/value-objects/bucket';
import { PeriodoAnio } from '../../domain/value-objects/periodo-anio';

/**
 * BucketSumRowAnual — aggregated sums per budget bucket for a single calendar
 * month within a year (US-030).
 *
 * `mes` uses the same "YYYY-MM" format as PeriodoMes.valor, so the use case
 * can match rows back to PeriodoAnio.meses() by string equality.
 *
 * The repository folds bucketId=null (uncategorized) into Bucket.SinCategoria
 * before returning rows — same contract as IResumenMesReader.
 */
export interface BucketSumRowAnual {
  readonly mes: string; // 'YYYY-MM'
  readonly bucket: Bucket;
  readonly totalCargo: bigint;
  readonly totalAbono: bigint;
  /**
   * US-045 (D-07): count of rows with `cargo > 0` in this bucket — never
   * abono rows. Widens in lockstep with BucketSumRow so this type stays
   * structurally assignable to it (CalcularResumenAnualUseCase depends on
   * that assignability to reuse the shared monthly assembly).
   */
  readonly cantidadCargos: number;
}

/**
 * IResumenAnualReader — narrow port for the 50/30/20 annual aggregation (US-030).
 *
 * Returns per-(month, bucket) BigInt sums for the given user and year in a
 * single query — does NOT compute percentages or semáforo — that remains the
 * use case's responsibility (reused from the monthly assembly, DRY).
 * Does NOT import from infrastructure.
 */
export interface IResumenAnualReader {
  sumarPorBucketAnual(
    userId: string,
    anio: PeriodoAnio,
  ): Promise<ReadonlyArray<BucketSumRowAnual>>;
}

/** Injection token — interfaces are erased at runtime; mirrors RESUMEN_MES_READER. */
export const RESUMEN_ANUAL_READER = 'IResumenAnualReader';
