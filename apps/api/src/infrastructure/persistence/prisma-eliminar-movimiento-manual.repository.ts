import { Result } from '../../shared/result';
import { TransaccionNoEncontradaError } from '../../domain/errors/transaccion-no-encontrada.error';
import { IEliminarMovimientoManualWriter } from '../../application/ports/eliminar-movimiento-manual.port';
import type { PrismaClient } from '@prisma/client';

/**
 * PrismaEliminarMovimientoManualRepository — implementación del port
 * IEliminarMovimientoManualWriter (correccion-movimientos-manuales, ADR-040,
 * D-01).
 *
 * SINGLE `deleteMany` statement — no `$transaction` (mirrors
 * `PrismaEliminarIngestaRepository` minus the cascade: `Transaccion` is a
 * leaf, no `onDelete: Cascade` pointing away from it, so there is no child
 * row to delete first).
 *
 * The WHERE clause `{ id, origen: 'Manual', account: { userId } }` is the
 * ENTIRE safety story (design.md D-01): `account: { userId }` gives
 * structural per-user isolation (RNF-SEC-006), and `origen: 'Manual'` is
 * what makes the clause airtight against cartola-derived rows — it is
 * indistinguishable from "the wrong content" or "not owned" ONLY because
 * ADR-039's `Transaccion_origen_ingesta_consistency` CHECK guarantees
 * `origen='Manual'` implies `ingestaId IS NULL` and vice versa; a future
 * writer that introduced a third `origen` value would silently fall outside
 * this clause (proposal.md risk 3) — that negative case is verified at the
 * integration level, not here.
 *
 * `deleteMany` (not `delete`) — returns `{ count: 0 }` instead of throwing.
 * The count IS the ownership+provenance gate: not-found, not-owned, and
 * not-manual all collapse to `count === 0` → the SAME
 * `TransaccionNoEncontradaError` (anti-enumeration, DEL-02) — a distinct
 * "this row is not manual" error would be a provenance oracle.
 *
 * No try/catch of infrastructure errors (mirrors
 * `PrismaEliminarIngestaRepository`): the ONLY domain error is
 * `TransaccionNoEncontradaError` (count===0); a DB fault propagates as an
 * exception toward the route handler → errorMiddleware → 500.
 */
export class PrismaEliminarMovimientoManualRepository implements IEliminarMovimientoManualWriter {
  constructor(private readonly prisma: PrismaClient) {}

  async eliminarManual(
    userId: string,
    transaccionId: string,
  ): Promise<Result<void, TransaccionNoEncontradaError>> {
    const { count } = await this.prisma.transaccion.deleteMany({
      where: {
        id: transaccionId,
        origen: 'Manual',
        account: { userId },
      },
    });

    if (count === 0) {
      // Not found, not owned, or not manual — merged, indistinguishable
      // (anti-enumeration, DEL-02).
      return Result.fail(new TransaccionNoEncontradaError(transaccionId));
    }

    return Result.ok(undefined);
  }
}
