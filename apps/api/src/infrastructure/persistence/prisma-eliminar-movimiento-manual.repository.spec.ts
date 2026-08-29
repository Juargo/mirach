import type { Mock } from 'vitest';
import { PrismaEliminarMovimientoManualRepository } from './prisma-eliminar-movimiento-manual.repository';
import { PrismaClient } from '@prisma/client';
import { TransaccionNoEncontradaError } from '../../domain/errors/transaccion-no-encontrada.error';

/**
 * Unit tests for PrismaEliminarMovimientoManualRepository — mocked
 * PrismaClient (correccion-movimientos-manuales, D-01). This is the
 * MOCKED-level guard for the load-bearing correctness decision: the SINGLE
 * `deleteMany` WHERE clause MUST be exactly `{ id, origen: 'Manual',
 * account: { userId } }`, and there is NO `$transaction` (Transaccion is a
 * leaf, no cascade). The real proof of the not-manual negative is the
 * integration test.
 */
describe('PrismaEliminarMovimientoManualRepository.eliminarManual', () => {
  function makePrisma(count: number): {
    prisma: PrismaClient;
    deleteMany: Mock;
  } {
    const deleteMany: Mock = vi.fn().mockResolvedValue({ count });
    const prisma = {
      transaccion: { deleteMany },
    } as unknown as PrismaClient;
    return { prisma, deleteMany };
  }

  it('sends a single deleteMany with the exact {id, origen: "Manual", account: {userId}} WHERE', async () => {
    const { prisma, deleteMany } = makePrisma(1);
    const repo = new PrismaEliminarMovimientoManualRepository(prisma);

    await repo.eliminarManual('user-a', 'tx-1');

    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        id: 'tx-1',
        origen: 'Manual',
        account: { userId: 'user-a' },
      },
    });
  });

  it('does NOT wrap the call in $transaction — Transaccion is a leaf, no cascade', async () => {
    const { prisma } = makePrisma(1);
    const repo = new PrismaEliminarMovimientoManualRepository(prisma);
    const transactionSpy = vi.fn();
    (prisma as unknown as { $transaction: Mock }).$transaction = transactionSpy;

    await repo.eliminarManual('user-a', 'tx-1');

    expect(transactionSpy).not.toHaveBeenCalled();
  });

  it('count===1 → Result.ok(undefined)', async () => {
    const { prisma } = makePrisma(1);
    const repo = new PrismaEliminarMovimientoManualRepository(prisma);

    const result = await repo.eliminarManual('user-a', 'tx-1');

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toBeUndefined();
  });

  it('count===0 → Result.fail(TransaccionNoEncontradaError) — not-found, not-owned, or not-manual, indistinguible', async () => {
    const { prisma } = makePrisma(0);
    const repo = new PrismaEliminarMovimientoManualRepository(prisma);

    const result = await repo.eliminarManual('user-a', 'tx-ajena');

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TransaccionNoEncontradaError);
  });

  it('deleteMany rejects → the error PROPAGATES (the repo does not wrap it)', async () => {
    const deleteMany: Mock = vi.fn().mockRejectedValue(new Error('DB caída'));
    const prisma = {
      transaccion: { deleteMany },
    } as unknown as PrismaClient;
    const repo = new PrismaEliminarMovimientoManualRepository(prisma);

    await expect(repo.eliminarManual('user-a', 'tx-1')).rejects.toThrow(
      'DB caída',
    );
  });
});
