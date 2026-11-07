import { PeriodoMes } from '../../domain/value-objects/periodo-mes';

/**
 * MovimientoParaAprender — the projection of a persisted movement that the
 * classification-learning flows need (CLA-03, CLA-15): the plaintext
 * `descripcion` to match patterns against, the amounts to tell an income
 * apart, and the current classification to apply the S2 exclusions.
 */
export interface MovimientoParaAprender {
  readonly id: string;
  readonly fecha: Date;
  /** Decrypted by the adapter (ADR-009): patterns match plaintext. */
  readonly descripcion: string;
  readonly cargo: bigint;
  readonly abono: bigint;
  readonly categoriaIdActual: string | null;
  /** CLA-16: the person chose this category by hand; a pattern never moves it. */
  readonly clasificacionManual: boolean;
}

/**
 * IMovimientosParaAprenderReader — read port of the learning flows.
 *
 * Every query filters by `userId` in the SQL WHERE (RNF-SEC-006), never in
 * memory. Never throws on an empty result.
 */
export interface IMovimientosParaAprenderReader {
  /** The movements of the financial month `periodo` (date range in SQL). */
  buscarDelPeriodo(
    userId: string,
    periodo: PeriodoMes,
  ): Promise<ReadonlyArray<MovimientoParaAprender>>;

  /** `null` ⇒ it does not exist or is not the person's (anti-enumeration). */
  buscarPorId(
    userId: string,
    id: string,
  ): Promise<MovimientoParaAprender | null>;
}
