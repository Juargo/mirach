import { EstadoIngesta } from '@prisma/client';
import {
  EstadoIngestaResumen,
  IListarIngestasReader,
  IngestaResumen,
} from '../../application/ports/listar-ingestas.port';
import type { PrismaClient } from '@prisma/client';

/**
 * Mapeo estado persistido (enum Prisma) → estado de dominio/UI (US-004,
 * CA-02). Traducir acá mantiene a application libre de `@prisma/client`.
 */
const ESTADO_A_RESUMEN: Record<EstadoIngesta, EstadoIngestaResumen> = {
  [EstadoIngesta.PROCESADA]: 'exitoso',
  [EstadoIngesta.FALLIDA]: 'fallido',
  [EstadoIngesta.PENDIENTE]: 'pendiente',
};

/**
 * PrismaListarIngestasReader — implementación del port
 * IListarIngestasReader (US-018 base; US-004 lo amplía a historial completo).
 *
 * SIN filtro de estado (US-004, CA-01/CA-04): el historial es traza de
 * auditoría e incluye PROCESADA/PENDIENTE/FALLIDA. Revierte el filtro
 * `estado: PROCESADA` de US-018 (D5), cuyo objetivo era acotar a lo
 * "limpiable"; US-004 redefine la lista como registro cronológico. Para las
 * no exitosas `totalTransacciones` es nulo en BD → coalesce a 0 (CA-03: el
 * conteo solo se muestra en las exitosas).
 *
 * Aislamiento estructural por `userId` (RNF-SEC-006) vía `account: { userId }`
 * — mismo patrón que prisma-movimientos-mes, prisma-resumen-mes,
 * prisma-detalle-bucket.
 */
export class PrismaListarIngestasReader implements IListarIngestasReader {
  constructor(private readonly prisma: PrismaClient) {}

  async listarPorUsuario(userId: string): Promise<IngestaResumen[]> {
    const rows = await this.prisma.ingesta.findMany({
      where: { account: { userId } },
      orderBy: { creadoEn: 'desc' },
      select: {
        id: true,
        banco: true,
        nombreArchivo: true,
        creadoEn: true,
        estado: true,
        totalTransacciones: true,
        motivoFallo: true,
      },
    });

    return rows.map((r) => ({
      id: r.id,
      banco: r.banco,
      nombreArchivo: r.nombreArchivo,
      fecha: r.creadoEn,
      estado: ESTADO_A_RESUMEN[r.estado],
      totalTransacciones: r.totalTransacciones ?? 0,
      motivoFallo: r.motivoFallo ?? null,
    }));
  }
}
