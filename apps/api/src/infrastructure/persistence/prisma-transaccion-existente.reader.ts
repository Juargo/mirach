import { Result } from '../../shared/result';
import { PersistenciaFallidaError } from '../../domain/errors/persistencia-fallida.error';
import { ICryptoService } from '../../application/ports/crypto-service.port';
import {
  ITransaccionExistenteReader,
  TransaccionExistente,
} from '../../application/ports/transaccion-existente-reader.port';
import { PrismaService } from './prisma.service';

/**
 * PrismaTransaccionExistenteReader — implementación Prisma del port de
 * lectura acotada para detección de duplicados (US-005).
 *
 * Bounded: filtra SIEMPRE por `accountId` + `fecha ∈ [gte, lte]` — nunca un
 * full-history scan. Backed por el índice no-único `(accountId, fecha)`
 * (§6 del design). El descifrado de `descripcion` ocurre AQUÍ, en infra,
 * porque solo infra tiene `ICryptoService` — la capa de aplicación recibe
 * texto plano y jamás consulta por `descripcion` (ADR-013, ver design §7).
 *
 * `userId` isolation (RNF-SEC-006): acotar por `accountId` es suficiente y
 * correcto — `accountId` se resuelve server-side desde el usuario
 * autenticado vía `AccountRepository.ensure` y está scoped por usuario por
 * construcción (`Account @@unique([userId, ...])`). Mismo enfoque que
 * `prisma-movimientos-mes.repository.ts`.
 *
 * Nunca lanza: cualquier error de Prisma se captura y se traduce a
 * Result.fail(PersistenciaFallidaError).
 */
export class PrismaTransaccionExistenteReader implements ITransaccionExistenteReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: ICryptoService,
  ) {}

  async buscarPorCuentaYRango(
    accountId: string,
    fechaDesde: Date,
    fechaHasta: Date,
  ): Promise<
    Result<ReadonlyArray<TransaccionExistente>, PersistenciaFallidaError>
  > {
    try {
      const rows = await this.prisma.transaccion.findMany({
        where: { accountId, fecha: { gte: fechaDesde, lte: fechaHasta } },
        select: { fecha: true, descripcion: true, cargo: true, abono: true },
      });

      return Result.ok(
        rows.map((row) => ({
          fecha: row.fecha,
          descripcion: this.crypto.decrypt(row.descripcion),
          cargo: row.cargo,
          abono: row.abono,
        })),
      );
    } catch (error) {
      return Result.fail(
        new PersistenciaFallidaError(
          'no se pudo consultar transacciones existentes para deduplicación',
          error instanceof Error ? error : undefined,
        ),
      );
    }
  }
}
