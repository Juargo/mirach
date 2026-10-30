import { Prisma } from '@prisma/client';
import { Bucket } from '../../domain/value-objects/bucket';
import { DiaCorte } from '../../domain/value-objects/mes-financiero';
import { PeriodoMes } from '../../domain/value-objects/periodo-mes';
import { BUCKET_IDS } from './bucket-ids';

const INGRESO_ID = BUCKET_IDS[Bucket.Ingreso];

/**
 * filtroFechaPeriodo — the `Transaccion` date filter of one financial month
 * (#111, PER-08), shared by every monthly reader so they never diverge.
 *
 * Calendar month (cut-off 1): the plain half-open `[desde, hasta)` filter,
 * the same query as before #111. Any other cut-off day: income rows
 * (`bucket-ingreso`) use the income window `[ingresoDesde, ingresoHasta)`
 * (3-day tolerance) and every other row — `bucketId` NULL included, which
 * folds to Deseos — uses `[desde, hasta)`. Wrapped in `AND` so it composes
 * with a bucket filter that carries its own `OR`.
 */
export function filtroFechaPeriodo(
  periodo: PeriodoMes,
): Prisma.TransaccionWhereInput {
  if (periodo.diaCorte.esCalendario) {
    return { fecha: { gte: periodo.desde, lt: periodo.hasta } };
  }
  return {
    AND: [
      {
        OR: [
          {
            bucketId: INGRESO_ID,
            fecha: { gte: periodo.ingresoDesde, lt: periodo.ingresoHasta },
          },
          {
            OR: [{ bucketId: null }, { bucketId: { not: INGRESO_ID } }],
            fecha: { gte: periodo.desde, lt: periodo.hasta },
          },
        ],
      },
    ],
  };
}

/**
 * etiquetaPeriodoSql — SQL expression with the `YYYY-MM` financial month of
 * the row aliased `t` (#111). Shifting a date back by `diaCorte − 1` days
 * lands it in the month its period starts in (a cut-off day is at most 28,
 * so the shift never skips a month); income rows shift 3 days less, which
 * is the PER-08 tolerance. With cut-off 1 both shifts are 0 and this is
 * `to_char(fecha, 'YYYY-MM')`, the UTC calendar month. `fecha` is a
 * `timestamp` without time zone written as UTC: do NOT add `AT TIME ZONE`.
 */
export function etiquetaPeriodoSql(diaCorte: DiaCorte): Prisma.Sql {
  const desplazamiento = diaCorte.valor - 1;
  const desplazamientoIngreso = desplazamiento - diaCorte.toleranciaIngresoDias;
  return Prisma.sql`to_char(t."fecha" - make_interval(days => CASE WHEN t."bucketId" = ${INGRESO_ID} THEN ${desplazamientoIngreso}::int ELSE ${desplazamiento}::int END), 'YYYY-MM')`;
}
