import type { Mock } from 'vitest';
import { PrismaRevertirIngestaFallidaRepository } from './prisma-revertir-ingesta-fallida.repository';
import { EstadoIngesta, PrismaClient } from '@prisma/client';
import { PersistenciaFallidaError } from '../../domain/errors/persistencia-fallida.error';

/**
 * Unit tests for PrismaRevertirIngestaFallidaRepository (issue #778 tramo
 * 5a-bis) — mocked PrismaClient, mirrors
 * `prisma-eliminar-ingesta.repository.spec.ts`.
 *
 * El invariante que estos tests protegen: el `updateMany` de `Ingesta`
 * (el gate de ownership/estado) tiene que correr y RESOLVERSE ANTES de que
 * el `deleteMany` de `Transaccion` se ejecute — con un `$transaction`
 * interactivo (callback), no el array-form. La prueba real de que Postgres
 * revierte TODO ante un `count === 0` es el integration test
 * (`test/revertir-ingesta-fallida.int-spec.ts`); acá se prueba por
 * mutación que el código NUNCA llama a `deleteMany` cuando el `updateMany`
 * no matcheó nada.
 */
describe('PrismaRevertirIngestaFallidaRepository.revertirYMarcarFallida', () => {
  function makePrisma(updateManyResult: { count: number }) {
    const updateMany: Mock = vi.fn().mockResolvedValue(updateManyResult);
    const deleteMany: Mock = vi.fn().mockResolvedValue({ count: 0 });
    const tx = {
      ingesta: { updateMany },
      transaccion: { deleteMany },
    };
    const transaction: Mock = vi.fn(
      async (cb: (tx: unknown) => Promise<unknown>) => cb(tx),
    );
    const prisma = {
      $transaction: transaction,
    } as unknown as PrismaClient;
    return { prisma, transaction, updateMany, deleteMany };
  }

  it('happy path: updateMany(count=1) → deleteMany corre → Result.ok(undefined)', async () => {
    const { prisma, updateMany, deleteMany } = makePrisma({ count: 1 });
    const repo = new PrismaRevertirIngestaFallidaRepository(prisma);

    const result = await repo.revertirYMarcarFallida(
      'user-a',
      'ing-1',
      'el writer falló',
    );

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toBeUndefined();

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'ing-1', userId: 'user-a', estado: EstadoIngesta.PROCESADA },
      data: { estado: EstadoIngesta.FALLIDA, motivoFallo: 'el writer falló' },
    });
    expect(deleteMany).toHaveBeenCalledWith({
      where: { ingestaId: 'ing-1', account: { userId: 'user-a' } },
    });
  });

  it('el WHERE del deleteMany filtra por account: { userId } — NUNCA en memoria (RNF-SEC-006)', async () => {
    const { prisma, deleteMany } = makePrisma({ count: 1 });
    const repo = new PrismaRevertirIngestaFallidaRepository(prisma);

    await repo.revertirYMarcarFallida('user-b', 'ing-2', 'motivo');

    const call = deleteMany.mock.calls[0][0] as {
      where: { ingestaId: string; account: { userId: string } };
    };
    expect(call.where.account).toEqual({ userId: 'user-b' });
    expect(call.where.ingestaId).toBe('ing-2');
  });

  it('MUTACIÓN clave: updateMany(count=0) → deleteMany NUNCA se llama (throw antes de tocar Transaccion) → Result.fail', async () => {
    const { prisma, deleteMany } = makePrisma({ count: 0 });
    const repo = new PrismaRevertirIngestaFallidaRepository(prisma);

    const result = await repo.revertirYMarcarFallida(
      'user-a',
      'ing-ajena-o-ya-no-procesada',
      'motivo',
    );

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PersistenciaFallidaError);
    // La prueba de atomicidad: si esto alguna vez se llama con count===0,
    // el bug es EXACTAMENTE la inconsistencia que este tramo existe para
    // evitar (transacciones borradas con la Ingesta todavía PROCESADA).
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('$transaction rechaza (deleteMany lanza dentro del callback) → Result.fail(PersistenciaFallidaError), nunca propaga', async () => {
    const updateMany: Mock = vi.fn().mockResolvedValue({ count: 1 });
    const deleteMany: Mock = vi
      .fn()
      .mockRejectedValue(new Error('DB caída a mitad de la reversión'));
    const tx = { ingesta: { updateMany }, transaccion: { deleteMany } };
    const transaction: Mock = vi.fn(
      async (cb: (tx: unknown) => Promise<unknown>) => cb(tx),
    );
    const prisma = { $transaction: transaction } as unknown as PrismaClient;
    const repo = new PrismaRevertirIngestaFallidaRepository(prisma);

    const result = await repo.revertirYMarcarFallida(
      'user-a',
      'ing-1',
      'motivo',
    );

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PersistenciaFallidaError);
  });
});
