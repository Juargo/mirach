import { EstadoIngesta } from '@prisma/client';
import {
  IListarIngestasReader,
  IngestaEstado,
  IngestaResumen,
} from '../../application/ports/listar-ingestas.port';
import type { PrismaClient } from '@prisma/client';

/**
 * aIngestaEstado — narrowing en el LÍMITE de infraestructura (US-004,
 * design.md §4.1).
 *
 * El `EstadoIngesta` generado por Prisma es la unión de 3 valores
 * ('PENDIENTE' | 'PROCESADA' | 'FALLIDA') — la cláusula WHERE de abajo NO lo
 * estrecha a nivel de tipos. Este helper narrows en el boundary: es sound
 * porque el WHERE garantiza que solo llegan filas PROCESADA/FALLIDA, y falla
 * ALTO (lanza) en lugar de mentirle al sistema de tipos si esa garantía
 * alguna vez se viola. Lanzar acá está permitido — esto es infraestructura,
 * no domain/application (ADR-005).
 */
function aIngestaEstado(e: EstadoIngesta): IngestaEstado {
  if (e === 'PROCESADA' || e === 'FALLIDA') return e;
  throw new Error(`reader devolvió estado inesperado: ${e}`);
}

/**
 * PrismaListarIngestasReader — implementación del port
 * IListarIngestasReader (US-004/US-018, design.md §4.1).
 *
 * `estado: { in: [PROCESADA, FALLIDA] }` (D7): el historial muestra AMBOS
 * desenlaces terminales — éxitos y fallos — y excluye cualquier PENDIENTE
 * huérfano legacy (nunca lo escribe el pipeline desde US-004).
 *
 * Aislamiento estructural por el `Ingesta.userId` DIRECTO (RNF-SEC-006,
 * design.md §4.1/D4) — no el join `account: { userId }` que usaba US-018.
 * Es el ÚNICO mecanismo capaz de aislar una fila FALLIDA sin `accountId`
 * (temprana, sin cuenta resuelta).
 */
export class PrismaListarIngestasReader implements IListarIngestasReader {
  constructor(private readonly prisma: PrismaClient) {}

  async listarPorUsuario(userId: string): Promise<IngestaResumen[]> {
    const rows = await this.prisma.ingesta.findMany({
      where: {
        userId,
        estado: { in: [EstadoIngesta.PROCESADA, EstadoIngesta.FALLIDA] },
      },
      orderBy: { creadoEn: 'desc' },
      select: {
        id: true,
        banco: true,
        nombreArchivo: true,
        estado: true,
        motivoFallo: true,
        creadoEn: true,
        totalTransacciones: true,
      },
    });

    return rows.map((r) => ({
      id: r.id,
      banco: r.banco,
      nombreArchivo: r.nombreArchivo,
      estado: aIngestaEstado(r.estado),
      motivoFallo: r.motivoFallo,
      fecha: r.creadoEn,
      totalTransacciones: r.totalTransacciones ?? 0,
    }));
  }
}
