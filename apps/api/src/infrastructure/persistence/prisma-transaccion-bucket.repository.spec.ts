import type { Mock } from 'vitest';
import { PrismaTransaccionBucketRepository } from './prisma-transaccion-bucket.repository';
import { PrismaClient } from '@prisma/client';
import { Bucket } from '../../domain/value-objects/bucket';
import { Categoria } from '../../domain/value-objects/categoria';
import { CategorizacionFallidaError } from '../../domain/errors/categorizacion-fallida.error';
import { BUCKET_IDS } from './bucket-ids';
import { CATEGORIA_IDS } from './categoria-ids';

/**
 * When `throws` is set, `$transaction` rejects — simulating a DB-level error.
 * updateMany still returns a pending promise; $transaction is the one that fails.
 */
function makePrismaMock(throws?: Error) {
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  // $transaction receives an array of already-resolved promises (Prisma batch style)
  const transaction = vi.fn(async (promises: Promise<unknown>[]) => {
    if (throws) throw throws;
    return Promise.all(promises);
  });
  return {
    transaccion: { updateMany },
    $transaction: transaction,
  } as unknown as PrismaClient;
}

describe('PrismaTransaccionBucketRepository', () => {
  describe('asignarCategorizacion()', () => {
    it('returns Result.ok({ actualizadas: 0 }) for empty array (edge case)', async () => {
      const prisma = makePrismaMock();
      const repo = new PrismaTransaccionBucketRepository(prisma);

      const result = await repo.asignarCategorizacion('ingesta-1', []);

      expect(result.isOk()).toBe(true);
      expect(result.getValue().actualizadas).toBe(0);
      expect((prisma.$transaction as Mock).mock.calls.length).toBe(0);
    });

    it('calls $transaction with updateMany calls grouped by (categoria, bucket), with ingestaId scope lock', async () => {
      const updateMany = vi.fn().mockResolvedValue({ count: 2 });
      const txFn = vi.fn(async (promises: Promise<unknown>[]) => {
        return Promise.all(promises);
      });
      const prisma = {
        transaccion: { updateMany },
        $transaction: txFn,
      } as unknown as PrismaClient;
      const repo = new PrismaTransaccionBucketRepository(prisma);

      const ingestaId = 'ingesta-abc-123';
      const asignaciones = [
        { transaccionId: 'tx-1', categoria: Categoria.Supermercado, bucket: Bucket.Necesidades },
        { transaccionId: 'tx-2', categoria: Categoria.Supermercado, bucket: Bucket.Necesidades },
        { transaccionId: 'tx-3', categoria: null, bucket: Bucket.Ingreso },
      ];

      const result = await repo.asignarCategorizacion(ingestaId, asignaciones);

      expect(result.isOk()).toBe(true);
      // Should have called $transaction once
      expect(txFn).toHaveBeenCalledTimes(1);
      // updateMany should have been called twice (one per unique (categoria,bucket) group)
      expect(updateMany).toHaveBeenCalledTimes(2);
      // Check updateMany called with correct args for the Supermercado/Necesidades group
      const supermercadoCall = updateMany.mock.calls.find(
        (call) => call[0].data.bucketId === BUCKET_IDS[Bucket.Necesidades],
      );
      expect(supermercadoCall).toBeDefined();
      expect(supermercadoCall![0].where.id.in).toEqual(['tx-1', 'tx-2']);
      expect(supermercadoCall![0].data.categoriaId).toBe(
        CATEGORIA_IDS[Categoria.Supermercado],
      );
      // SCOPE ISOLATION: ingestaId must be in the WHERE clause (double-lock)
      expect(supermercadoCall![0].where.ingestaId).toBe(ingestaId);
      // Check updateMany called with correct args for the null-categoria/Ingreso group
      const ingresoCall = updateMany.mock.calls.find(
        (call) => call[0].data.bucketId === BUCKET_IDS[Bucket.Ingreso],
      );
      expect(ingresoCall).toBeDefined();
      expect(ingresoCall![0].where.id.in).toEqual(['tx-3']);
      expect(ingresoCall![0].data.categoriaId).toBeNull();
      expect(ingresoCall![0].where.ingestaId).toBe(ingestaId);
    });

    it('returns correct total actualizadas count across all groups', async () => {
      const updateMany = vi
        .fn()
        .mockResolvedValueOnce({ count: 3 })
        .mockResolvedValueOnce({ count: 2 });
      const txFn = vi.fn(async (promises: Promise<unknown>[]) =>
        Promise.all(promises),
      );
      const prisma = {
        transaccion: { updateMany },
        $transaction: txFn,
      } as unknown as PrismaClient;
      const repo = new PrismaTransaccionBucketRepository(prisma);

      const asignaciones = [
        { transaccionId: 'tx-1', categoria: Categoria.Supermercado, bucket: Bucket.Necesidades },
        { transaccionId: 'tx-2', categoria: Categoria.Supermercado, bucket: Bucket.Necesidades },
        { transaccionId: 'tx-3', categoria: Categoria.Supermercado, bucket: Bucket.Necesidades },
        { transaccionId: 'tx-4', categoria: Categoria.Streaming, bucket: Bucket.Deseos },
        { transaccionId: 'tx-5', categoria: Categoria.Streaming, bucket: Bucket.Deseos },
      ];

      const result = await repo.asignarCategorizacion('ingesta-xyz', asignaciones);

      expect(result.isOk()).toBe(true);
      expect(result.getValue().actualizadas).toBe(5);
    });

    it('two DIFFERENT categorías in the SAME bucket produce two separate groups (categoria drives grouping, not just bucket)', async () => {
      const updateMany = vi.fn().mockResolvedValue({ count: 1 });
      const txFn = vi.fn(async (promises: Promise<unknown>[]) =>
        Promise.all(promises),
      );
      const prisma = {
        transaccion: { updateMany },
        $transaction: txFn,
      } as unknown as PrismaClient;
      const repo = new PrismaTransaccionBucketRepository(prisma);

      // Supermercado and Combustible both derive to Necesidades — but they are
      // DIFFERENT categorías and must be written as separate groups (distinct
      // categoriaId), even though bucketId is identical for both.
      const asignaciones = [
        { transaccionId: 'tx-1', categoria: Categoria.Supermercado, bucket: Bucket.Necesidades },
        { transaccionId: 'tx-2', categoria: Categoria.Combustible, bucket: Bucket.Necesidades },
      ];

      await repo.asignarCategorizacion('ingesta-1', asignaciones);

      expect(updateMany).toHaveBeenCalledTimes(2);
      const supermercadoCall = updateMany.mock.calls.find(
        (call) => call[0].data.categoriaId === CATEGORIA_IDS[Categoria.Supermercado],
      );
      const combustibleCall = updateMany.mock.calls.find(
        (call) => call[0].data.categoriaId === CATEGORIA_IDS[Categoria.Combustible],
      );
      expect(supermercadoCall![0].where.id.in).toEqual(['tx-1']);
      expect(combustibleCall![0].where.id.in).toEqual(['tx-2']);
    });

    it('returns Result.fail(CategorizacionFallidaError) when $transaction throws', async () => {
      const prisma = makePrismaMock(new Error('database error'));
      const repo = new PrismaTransaccionBucketRepository(prisma);

      const asignaciones = [
        { transaccionId: 'tx-1', categoria: Categoria.Supermercado, bucket: Bucket.Necesidades },
      ];

      const result = await repo.asignarCategorizacion('ingesta-1', asignaciones);

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CategorizacionFallidaError);
      expect(result.getError().causa).toBeInstanceOf(Error);
    });

    it('never throws even when $transaction throws (returns Result.fail)', async () => {
      const prisma = makePrismaMock(new Error('connection lost'));
      const repo = new PrismaTransaccionBucketRepository(prisma);

      const asignaciones = [
        { transaccionId: 'tx-1', categoria: null, bucket: Bucket.SinCategoria },
      ];
      await expect(
        repo.asignarCategorizacion('ingesta-1', asignaciones),
      ).resolves.toBeDefined();
      const result = await repo.asignarCategorizacion('ingesta-1', asignaciones);
      expect(result.isFail()).toBe(true);
    });

    it('maps Categoria/Bucket enums to correct physical ids in updateMany call, with ingestaId scope lock', async () => {
      const updateMany = vi.fn().mockResolvedValue({ count: 1 });
      const txFn = vi.fn(async (promises: Promise<unknown>[]) =>
        Promise.all(promises),
      );
      const prisma = {
        transaccion: { updateMany },
        $transaction: txFn,
      } as unknown as PrismaClient;
      const repo = new PrismaTransaccionBucketRepository(prisma);

      await repo.asignarCategorizacion('ingesta-scope-test', [
        { transaccionId: 'tx-1', categoria: Categoria.Ahorro, bucket: Bucket.Ahorro },
      ]);

      expect(updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['tx-1'] }, ingestaId: 'ingesta-scope-test' },
        data: {
          categoriaId: CATEGORIA_IDS[Categoria.Ahorro],
          bucketId: BUCKET_IDS[Bucket.Ahorro],
        },
      });
    });

    it('maps a null categoria to a null categoriaId (Ingreso / SinCategoria rows)', async () => {
      const updateMany = vi.fn().mockResolvedValue({ count: 1 });
      const txFn = vi.fn(async (promises: Promise<unknown>[]) =>
        Promise.all(promises),
      );
      const prisma = {
        transaccion: { updateMany },
        $transaction: txFn,
      } as unknown as PrismaClient;
      const repo = new PrismaTransaccionBucketRepository(prisma);

      await repo.asignarCategorizacion('ingesta-1', [
        { transaccionId: 'tx-1', categoria: null, bucket: Bucket.SinCategoria },
      ]);

      expect(updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['tx-1'] }, ingestaId: 'ingesta-1' },
        data: {
          categoriaId: null,
          bucketId: BUCKET_IDS[Bucket.SinCategoria],
        },
      });
    });
  });
});
