import type { Mock } from 'vitest';
import { PrismaEliminarIngestaRepository } from './prisma-eliminar-ingesta.repository';
import { EstadoIngesta, PrismaClient } from '@prisma/client';
import { IngestaNoEncontradaError } from '../../domain/errors/ingesta-no-encontrada.error';

/**
 * Unit tests for PrismaEliminarIngestaRepository — mocked PrismaClient
 * (US-018 §3.1/§3.2, hardened post-4R-review for US-004). This is the
 * MOCKED-level guard for the load-bearing correctness decisions: both
 * `deleteMany` where-clauses MUST be `userId`-scoped (now via the DIRECT
 * `Ingesta.userId` column, consistent with `prisma-listar-ingestas.reader.ts`
 * — not the `account: { userId }` join, which after US-004 misses FALLIDA
 * rows by accident since they have `accountId = null`), children FIRST
 * (mandatory under FK `Restrict`), AND both clauses MUST gate on
 * `estado: PROCESADA` so "a FALLIDA row is not deletable" is an EXPLICIT
 * contract, not a side effect of the join never matching. The real proof is
 * the integration test (T1.15).
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
      where: {
        ingestaId: 'ing-1',
        ingesta: { userId: 'user-a', estado: EstadoIngesta.PROCESADA },
      },
    });
    expect(prisma.ingesta.deleteMany).toHaveBeenCalledWith({
      where: {
        id: 'ing-1',
        userId: 'user-a',
        estado: EstadoIngesta.PROCESADA,
      },
    });
  });

  it('T1.6b: AMBAS cláusulas WHERE están userId-scoped vía la columna directa (no el join account) — el hijo vía ingesta.userId', async () => {
    const { prisma } = makePrisma([{ count: 0 }, { count: 1 }]);
    const repo = new PrismaEliminarIngestaRepository(prisma);

    await repo.eliminarConTransacciones('user-b', 'ing-2');

    const childCall = (prisma.transaccion.deleteMany as unknown as Mock).mock
      .calls[0][0];
    expect(childCall).toEqual({
      where: {
        ingestaId: 'ing-2',
        ingesta: { userId: 'user-b', estado: EstadoIngesta.PROCESADA },
      },
    });
    const parentCall = (prisma.ingesta.deleteMany as unknown as Mock).mock
      .calls[0][0];
    expect(parentCall).toEqual({
      where: {
        id: 'ing-2',
        userId: 'user-b',
        estado: EstadoIngesta.PROCESADA,
      },
    });
  });

  it('T1.6f: AMBAS cláusulas WHERE gatean explícitamente por estado: PROCESADA — una fila FALLIDA nunca es alcanzable (contrato explícito, no accidente del join)', async () => {
    const { prisma } = makePrisma([{ count: 0 }, { count: 0 }]);
    const repo = new PrismaEliminarIngestaRepository(prisma);

    await repo.eliminarConTransacciones('user-a', 'ing-fallida');

    const childCall = (prisma.transaccion.deleteMany as unknown as Mock).mock
      .calls[0][0];
    const parentCall = (prisma.ingesta.deleteMany as unknown as Mock).mock
      .calls[0][0];
    expect(childCall.where.ingesta.estado).toBe(EstadoIngesta.PROCESADA);
    expect(parentCall.where.estado).toBe(EstadoIngesta.PROCESADA);
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
