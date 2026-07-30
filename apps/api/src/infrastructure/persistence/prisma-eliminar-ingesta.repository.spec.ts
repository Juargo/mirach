import type { Mock } from 'vitest';
import { PrismaEliminarIngestaRepository } from './prisma-eliminar-ingesta.repository';
import { PrismaClient } from '@prisma/client';
import { IngestaNoEncontradaError } from '../../domain/errors/ingesta-no-encontrada.error';

/**
 * Unit tests for PrismaEliminarIngestaRepository — mocked PrismaClient
 * (US-018, design.md §3.1/§3.2). This is the MOCKED-level guard for the
 * load-bearing correctness decision: both `deleteMany` where-clauses MUST be
 * userId-scoped, children FIRST (mandatory under FK `Restrict`). The real
 * proof is the integration test (T1.15).
 */
describe('PrismaEliminarIngestaRepository.eliminarConTransacciones', () => {
  function makePrisma(transactionResult: unknown[]): {
    prisma: PrismaClient;
    transaction: Mock;
  } {
    const transaction: Mock = vi.fn().mockResolvedValue(transactionResult);
    const prisma = {
      transaccion: { deleteMany: vi.fn() },
      ingesta: { deleteMany: vi.fn() },
      $transaction: transaction,
    } as unknown as PrismaClient;
    return { prisma, transaction };
  }

  it('T1.6a: envía un $transaction([...]) de longitud 2, hijo (transaccion) en índice 0, padre (ingesta) en índice 1', async () => {
    const { prisma, transaction } = makePrisma([{ count: 3 }, { count: 1 }]);
    const repo = new PrismaEliminarIngestaRepository(prisma);

    await repo.eliminarConTransacciones('user-a', 'ing-1');

    expect(transaction).toHaveBeenCalledTimes(1);
    const ops = transaction.mock.calls[0][0] as unknown[];
    expect(ops).toHaveLength(2);
    expect(prisma.transaccion.deleteMany).toHaveBeenCalledWith({
      where: { ingestaId: 'ing-1', ingesta: { account: { userId: 'user-a' } } },
    });
    expect(prisma.ingesta.deleteMany).toHaveBeenCalledWith({
      where: { id: 'ing-1', account: { userId: 'user-a' } },
    });
  });

  it('T1.6b: AMBAS cláusulas WHERE están userId-scoped — el hijo vía ingesta.account.userId (§3.2)', async () => {
    const { prisma } = makePrisma([{ count: 0 }, { count: 1 }]);
    const repo = new PrismaEliminarIngestaRepository(prisma);

    await repo.eliminarConTransacciones('user-b', 'ing-2');

    const childCall = (prisma.transaccion.deleteMany as unknown as Mock).mock
      .calls[0][0];
    expect(childCall).toEqual({
      where: {
        ingestaId: 'ing-2',
        ingesta: { account: { userId: 'user-b' } },
      },
    });
    const parentCall = (prisma.ingesta.deleteMany as unknown as Mock).mock
      .calls[0][0];
    expect(parentCall).toEqual({
      where: { id: 'ing-2', account: { userId: 'user-b' } },
    });
  });

  it('T1.6c: parent count===1 → Result.ok(undefined)', async () => {
    const { prisma } = makePrisma([{ count: 5 }, { count: 1 }]);
    const repo = new PrismaEliminarIngestaRepository(prisma);

    const result = await repo.eliminarConTransacciones('user-a', 'ing-1');

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toBeUndefined();
  });

  it('T1.6d: parent count===0 → Result.fail(IngestaNoEncontradaError) — not-found OR not-owned, indistinguible', async () => {
    const { prisma } = makePrisma([{ count: 0 }, { count: 0 }]);
    const repo = new PrismaEliminarIngestaRepository(prisma);

    const result = await repo.eliminarConTransacciones('user-a', 'ing-ajena');

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(IngestaNoEncontradaError);
  });

  it('T1.6e: $transaction rechaza → el error PROPAGA (el repo no lo envuelve, contraste con el write repo, §3.4)', async () => {
    const transaction: Mock = vi.fn().mockRejectedValue(new Error('DB caída'));
    const prisma = {
      transaccion: { deleteMany: vi.fn() },
      ingesta: { deleteMany: vi.fn() },
      $transaction: transaction,
    } as unknown as PrismaClient;
    const repo = new PrismaEliminarIngestaRepository(prisma);

    await expect(
      repo.eliminarConTransacciones('user-a', 'ing-1'),
    ).rejects.toThrow('DB caída');
  });
});
