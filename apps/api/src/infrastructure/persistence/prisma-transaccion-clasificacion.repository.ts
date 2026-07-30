import {
  ITransaccionParaClasificarReader,
  TransaccionParaClasificar,
} from '../../application/ports/transaccion-para-clasificar.port';
import { ICryptoService } from '../../application/ports/crypto-service.port';
import type { PrismaClient } from '@prisma/client';

/**
 * PrismaTransaccionClasificacionRepository — implementación del port de lectura
 * para la categorización post-persistencia (US-012).
 *
 * Lee id + descripcion + cargo + abono de las transacciones de una Ingesta.
 * Los campos de monto son BigInt en Prisma/PostgreSQL y se devuelven como bigint
 * sin conversión a number (regla del proyecto: el dinero usa tipos exactos, nunca float).
 *
 * `descripcion` se descifra AQUÍ, en infra (ADR-013) — CategorizarTransaccionUseCase
 * hace pattern matching por descripción; si se le pasara el ciphertext, TODA
 * transacción degradaría a SinCategoria en silencio. Mismo patrón que
 * `PrismaTransaccionExistenteReader`.
 *
 * Nunca lanza: errores se propagan como excepción al orquestador que los maneja
 * dentro de su try/catch island de categorización.
 */
export class PrismaTransaccionClasificacionRepository implements ITransaccionParaClasificarReader {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly crypto: ICryptoService,
  ) {}

  async findParaClasificar(
    ingestaId: string,
  ): Promise<ReadonlyArray<TransaccionParaClasificar>> {
    const rows = await this.prisma.transaccion.findMany({
      where: { ingestaId },
      select: { id: true, descripcion: true, cargo: true, abono: true },
      orderBy: { creadoEn: 'asc' },
    });

    return rows.map((row) => ({
      id: row.id,
      descripcion: this.crypto.decrypt(row.descripcion),
      cargo: row.cargo,
      abono: row.abono,
    }));
  }
}
