import { EstadoIngesta } from '@prisma/client';
import {
  IListarIngestasReader,
  IngestaResumen,
} from '../../application/ports/listar-ingestas.port';
import type { PrismaClient } from '@prisma/client';

/**
 * PrismaListarIngestasReader — implementación del port
 * IListarIngestasReader (US-018, design.md §5.2).
 *
 * `estado: PROCESADA` (D5): solo estas ingestas persistieron transacciones
 * visibles en resumen/semáforo/anual — PENDIENTE/FALLIDA no tienen nada que
 * el usuario necesite limpiar. Bonus: garantiza `totalTransacciones`
 * no-nulo (el `?? 0` es defensivo).
 *
 * Aislamiento estructural por `userId` (RNF-SEC-006) vía `account: { userId }`
 * — mismo patrón que prisma-movimientos-mes, prisma-resumen-mes,
 * prisma-detalle-bucket.
 */
export class PrismaListarIngestasReader implements IListarIngestasReader {
  constructor(private readonly prisma: PrismaClient) {}

  async listarPorUsuario(userId: string): Promise<IngestaResumen[]> {
    const rows = await this.prisma.ingesta.findMany({
      where: { account: { userId }, estado: EstadoIngesta.PROCESADA },
      orderBy: { creadoEn: 'desc' },
      select: {
        id: true,
        banco: true,
        creadoEn: true,
        totalTransacciones: true,
      },
    });

    return rows.map((r) => ({
      id: r.id,
      banco: r.banco,
      fecha: r.creadoEn,
      totalTransacciones: r.totalTransacciones ?? 0,
    }));
  }
}
