import { IUltimoPeriodoConDatosReader } from '../../application/ports/ultimo-periodo-con-datos.port';
import { PeriodoMes } from '../../domain/value-objects/periodo-mes';
import type { PrismaClient } from '@prisma/client';

/**
 * PrismaUltimoPeriodoConDatosReader — implementación Prisma de
 * IUltimoPeriodoConDatosReader (issue #747).
 *
 * `findFirst` orderBy `fecha desc` para obtener la transacción más
 * reciente del usuario, acotada con la MISMA cláusula de aislamiento
 * estructural que el resto de los readers mensuales (`account: { userId }`,
 * RNF-SEC-006 — ver prisma-resumen-mes.repository.ts / prisma-movimientos-
 * mes.repository.ts).
 *
 * Deriva `YYYY-MM` de `fecha` con `getUTCFullYear()`/`getUTCMonth() + 1` —
 * LA MISMA aritmética UTC que `PeriodoMes.crear()`/`PeriodoMes.actual()`
 * usan para construir `desde`/`hasta` — así el mes derivado es exactamente
 * el mes que `sumarPorBucket`/`findByPeriodo` consultarían para esa fecha
 * (mismo rango half-open [desde, hasta)); una fecha a las 23:59:59.999Z del
 * día 31 sigue perteneciendo a ese mes UTC, nunca al siguiente.
 *
 * `null` cuando el usuario no tiene ninguna transacción — estado válido, no
 * un error (el caller, `resolverPeriodo`, cae a `PeriodoMes.actual()`).
 */
export class PrismaUltimoPeriodoConDatosReader implements IUltimoPeriodoConDatosReader {
  constructor(private readonly prisma: PrismaClient) {}

  async ultimoPeriodoConDatos(userId: string): Promise<PeriodoMes | null> {
    const row = await this.prisma.transaccion.findFirst({
      where: { account: { userId } }, // USER ISOLATION — structural
      orderBy: { fecha: 'desc' },
      select: { fecha: true },
    });

    if (row === null) {
      return null;
    }

    const year = row.fecha.getUTCFullYear();
    const month = row.fecha.getUTCMonth() + 1;
    const valor = `${year}-${String(month).padStart(2, '0')}`;

    // PeriodoMes.crear() solo puede fallar por formato/rango; un valor
    // derivado de una fecha real de la BD (año en [2000,2999], mes en
    // [1,12]) siempre es válido — el `null` defensivo no debería
    // ejercitarse nunca en producción.
    const resultado = PeriodoMes.crear(valor);
    return resultado.isOk() ? resultado.getValue() : null;
  }
}
