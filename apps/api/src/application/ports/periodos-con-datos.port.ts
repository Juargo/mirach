import { PeriodoMes } from '../../domain/value-objects/periodo-mes';

/**
 * IPeriodosConDatosReader — narrow read-only port: every calendar month (UTC)
 * in which the user has AT LEAST ONE movement.
 *
 * A "movement" is any `Transaccion` of the user's accounts — expense or income
 * (`abono` only), whatever its category (internal categories included). This
 * is the exact rule `IUltimoPeriodoConDatosReader` applies, and the month is
 * derived with the same UTC arithmetic `PeriodoMes` uses for its `[desde,
 * hasta)` range, so a listed month always yields data in the monthly readers
 * (`GET /api/resumen`, detalle de bucket, ingresos del mes).
 *
 * Order is not part of the port contract (the use case owns it). The
 * implementation must scope by user structurally (RNF-SEC-006) and group by
 * month in the database — never load the user's transactions into memory.
 */
export interface IPeriodosConDatosReader {
  periodosConDatos(userId: string): Promise<ReadonlyArray<PeriodoMes>>;
}

/** Injection token — interfaces are erased at runtime. */
export const PERIODOS_CON_DATOS_READER = 'IPeriodosConDatosReader';
