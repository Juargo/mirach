import {
  IMovimientosMesReader,
  MovimientoMesRow,
} from '../../application/ports/movimientos-mes.port';
import { PeriodoMes } from '../../domain/value-objects/periodo-mes';
import { PrismaService } from './prisma.service';

/**
 * PrismaMovimientosMesRepository — implementación del port de lectura mensual
 * para la consolidación de movimientos (US-014).
 *
 * Filtra por userId a través del Account (user isolation estructural en la
 * cláusula WHERE — no en app-layer). Los montos cargo/abono son BigInt y se
 * devuelven sin conversión (la serialización a string ocurre solo en el DTO HTTP).
 *
 * Orden determinista: fecha asc, id asc como tiebreak para same-date rows.
 */
export class PrismaMovimientosMesRepository implements IMovimientosMesReader {
  constructor(private readonly prisma: PrismaService) {}

  async findByPeriodo(
    userId: string,
    periodo: PeriodoMes,
  ): Promise<ReadonlyArray<MovimientoMesRow>> {
    const rows = await this.prisma.transaccion.findMany({
      where: {
        account: { userId },
        fecha: { gte: periodo.desde, lt: periodo.hasta },
      },
      select: {
        id: true,
        fecha: true,
        descripcion: true,
        cargo: true,
        abono: true,
        bucketId: true,
        account: {
          select: {
            banco: true,
            tipoCuenta: true,
            numeroCuenta: true,
          },
        },
      },
      orderBy: [{ fecha: 'asc' }, { id: 'asc' }],
    });

    return rows.map((row) => ({
      id: row.id,
      fecha: row.fecha,
      descripcion: row.descripcion,
      cargo: row.cargo,
      abono: row.abono,
      bucketId: row.bucketId,
      banco: row.account.banco,
      tipoCuenta: row.account.tipoCuenta,
      numeroCuenta: row.account.numeroCuenta,
    }));
  }
}
