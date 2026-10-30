import { IUltimoPeriodoConDatosReader } from '../../application/ports/ultimo-periodo-con-datos.port';
import { PeriodoMes } from '../../domain/value-objects/periodo-mes';
import { DiaCorte } from '../../domain/value-objects/mes-financiero';
import { etiquetaPeriodoSql } from './periodo-filtro';
import type { PrismaClient } from '@prisma/client';

/**
 * PrismaUltimoPeriodoConDatosReader — implementación Prisma de
 * IUltimoPeriodoConDatosReader (issue #747).
 *
 * Etiqueta cada transacción con su mes financiero (`etiquetaPeriodoSql`,
 * #111) y devuelve el mayor, acotado con la MISMA cláusula de aislamiento
 * estructural que el resto de los readers mensuales (join por `Account`,
 * `a."userId"` como parámetro — RNF-SEC-006). Es la misma etiqueta que usa
 * `/api/periodos`, así el período por defecto es el primero de esa lista.
 * Con corte 1 la etiqueta es el mes UTC de `fecha`, el mismo que `PeriodoMes`
 * usa para su rango half-open [desde, hasta).
 *
 * `null` cuando el usuario no tiene ninguna transacción — estado válido, no
 * un error (el caller, `resolverPeriodo`, cae a `PeriodoMes.actual()`).
 */
export class PrismaUltimoPeriodoConDatosReader implements IUltimoPeriodoConDatosReader {
  constructor(private readonly prisma: PrismaClient) {}

  async ultimoPeriodoConDatos(
    userId: string,
    diaCorte: DiaCorte,
  ): Promise<PeriodoMes | null> {
    // Same label as `/api/periodos` (`etiquetaPeriodoSql`), so the default
    // period is always the first one that list offers (#111).
    const rows = await this.prisma.$queryRaw<Array<{ periodo: string }>>`
      SELECT ${etiquetaPeriodoSql(diaCorte)} AS periodo
      FROM "Transaccion" t
      JOIN "Account" a ON a."id" = t."accountId"
      WHERE a."userId" = ${userId}
      ORDER BY 1 DESC
      LIMIT 1
    `;

    if (rows.length === 0) {
      return null;
    }

    // PeriodoMes.crear() solo puede fallar por formato/rango; un valor
    // derivado de una fecha real de la BD (año en [2000,2999], mes en
    // [1,12]) siempre es válido — el `null` defensivo no debería
    // ejercitarse nunca en producción.
    const resultado = PeriodoMes.crear(rows[0].periodo, diaCorte);
    return resultado.isOk() ? resultado.getValue() : null;
  }
}
