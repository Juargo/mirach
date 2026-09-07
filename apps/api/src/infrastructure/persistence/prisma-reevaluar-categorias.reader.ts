import {
  IReevaluarCategoriasReader,
  TransaccionParaReevaluar,
} from '../../application/ports/reevaluar-categorias-reader.port';
import { ICryptoService } from '../../application/ports/crypto-service.port';
import { resolverBucket } from './bucket-ids';
import type { PrismaClient } from '@prisma/client';

/**
 * PrismaReevaluarCategoriasReader — implementación del port
 * IReevaluarCategoriasReader (`POST /api/transacciones/reevaluar`).
 *
 * Lee TODAS las transacciones del usuario — `where: { account: { userId } }`
 * es el ÚNICO filtro (RNF-SEC-006, estructural en SQL, nunca en memoria). A
 * diferencia de `PrismaTransaccionClasificacionRepository` (scope por
 * ingesta, solo filas nunca clasificadas), acá no hay filtro de
 * `categoriaId`, `ingestaId` ni de período: el alcance es explícitamente
 * "todo el historial del usuario" (decisión confirmada).
 *
 * `descripcion` se descifra AQUÍ (ADR-013) — mismo motivo que el reader de
 * ingesta: `CategorizarTransaccionUseCase` hace pattern matching por
 * descripción, y correr contra ciphertext degradaría todo a SinCategoria en
 * silencio.
 *
 * `bucketId` físico se resuelve a `Bucket` de dominio vía `resolverBucket`
 * (fold compartido, DRY) — el use case compara este valor con el resultado
 * de la reclasificación para decidir si una fila realmente cambió.
 *
 * Nunca lanza: un fallo de Prisma se propaga como excepción al caller (mismo
 * contrato que `PrismaTransaccionClasificacionRepository` — no hay isla
 * try/catch en este reader, el use case que lo invoca no está en un pipeline
 * degradable).
 */
export class PrismaReevaluarCategoriasReader implements IReevaluarCategoriasReader {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly crypto: ICryptoService,
  ) {}

  async findTodasDelUsuario(
    userId: string,
  ): Promise<ReadonlyArray<TransaccionParaReevaluar>> {
    const rows = await this.prisma.transaccion.findMany({
      where: { account: { userId } },
      select: {
        id: true,
        descripcion: true,
        cargo: true,
        abono: true,
        categoriaId: true,
        bucketId: true,
      },
    });

    return rows.map((row) => ({
      id: row.id,
      descripcion: this.crypto.decrypt(row.descripcion),
      cargo: row.cargo,
      abono: row.abono,
      categoriaIdActual: row.categoriaId,
      bucketActual: resolverBucket(row.bucketId),
    }));
  }
}
