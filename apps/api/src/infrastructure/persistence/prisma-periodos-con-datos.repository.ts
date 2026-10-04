import type { PrismaClient } from '@prisma/client';
import { IPeriodosConDatosReader } from '../../application/ports/periodos-con-datos.port';
import { PeriodoMes } from '../../domain/value-objects/periodo-mes';

/**
 * PrismaPeriodosConDatosReader — implementation of IPeriodosConDatosReader.
 *
 * One grouped query, no rows loaded into memory: `Transaccion.fecha` is a
 * `TIMESTAMP(3)` WITHOUT time zone that Prisma writes as UTC, so
 * `to_char(fecha, 'YYYY-MM')` is the UTC month — the same month
 * `PrismaUltimoPeriodoConDatosReader` derives with `getUTCFullYear()` /
 * `getUTCMonth()` and the same one `PeriodoMes` uses for its half-open
 * `[desde, hasta)` range. (Do NOT add `AT TIME ZONE`: on a `timestamp`
 * column it would reinterpret the value in the session time zone.)
 *
 * Isolation is structural: the join through `Account` filters
 * `a."userId" = $1` in the WHERE (RNF-SEC-006), with a bound parameter.
 * No filter on category or on `cargo`/`abono`: every movement counts, as in
 * the default-period reader and the monthly readers.
 *
 * Values outside `PeriodoMes`'s range (year not in 2000..2999) are skipped:
 * `/api/resumen` would reject them with 400, so listing them would offer a
 * month the app cannot open.
 */
export class PrismaPeriodosConDatosReader implements IPeriodosConDatosReader {
  constructor(private readonly prisma: PrismaClient) {}

  async periodosConDatos(userId: string): Promise<ReadonlyArray<PeriodoMes>> {
    const rows = await this.prisma.$queryRaw<Array<{ periodo: string }>>`
      SELECT to_char(t."fecha", 'YYYY-MM') AS periodo
      FROM "Transaccion" t
      JOIN "Account" a ON a."id" = t."accountId"
      WHERE a."userId" = ${userId}
      GROUP BY 1
      ORDER BY 1 DESC
    `;

    const periodos: PeriodoMes[] = [];
    for (const row of rows) {
      const resultado = PeriodoMes.crear(row.periodo);
      if (resultado.isOk()) {
        periodos.push(resultado.getValue());
      }
    }
    return periodos;
  }
}
