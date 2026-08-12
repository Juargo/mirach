import type { Mock } from 'vitest';
import { PrismaTransaccionBucketRepository } from './prisma-transaccion-bucket.repository';
import { PrismaClient } from '@prisma/client';
import { Bucket } from '../../domain/value-objects/bucket';
import { CategorizacionFallidaError } from '../../domain/errors/categorizacion-fallida.error';
import { BUCKET_IDS } from './bucket-ids';

const USER_ID = 'user-owner-of-this-catalog';

/**
 * Tras ADR-037/Q5, `asignaciones` ya trae el `categoriaId` REAL resuelto
 * contra el catálogo del usuario clasificador (design.md §3.3) — el writer
 * NO hace ningún lookup de categoría. `$transaction` recibe un array de
 * promesas ya resueltas (Prisma batch style).
 */
function makePrismaMock(options?: { throws?: Error }) {
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const findMany = vi.fn();
  const transaction = vi.fn(async (promises: Promise<unknown>[]) => {
    if (options?.throws) throw options.throws;
    return Promise.all(promises);
  });
  return {
    transaccion: { updateMany },
    categoria: { findMany },
    $transaction: transaction,
  } as unknown as PrismaClient;
}

describe('PrismaTransaccionBucketRepository', () => {
  describe('asignarCategorizacion()', () => {
    it('returns Result.ok({ actualizadas: 0 }) for empty array (edge case)', async () => {
      const prisma = makePrismaMock();
      const repo = new PrismaTransaccionBucketRepository(prisma);

      const result = await repo.asignarCategorizacion(USER_ID, 'ingesta-1', []);

      expect(result.isOk()).toBe(true);
      expect(result.getValue().actualizadas).toBe(0);
      expect((prisma.$transaction as Mock).mock.calls.length).toBe(0);
    });

    it('calls $transaction with updateMany calls grouped by (categoriaId, bucket), with ingestaId + account.userId triple lock', async () => {
      const prisma = makePrismaMock();
      const repo = new PrismaTransaccionBucketRepository(prisma);

      const ingestaId = 'ingesta-abc-123';
      const asignaciones = [
        {
          transaccionId: 'tx-1',
          categoriaId: 'own-supermercado-row-id',
          bucket: Bucket.Necesidades,
        },
        {
          transaccionId: 'tx-2',
          categoriaId: 'own-supermercado-row-id',
          bucket: Bucket.Necesidades,
        },
        { transaccionId: 'tx-3', categoriaId: null, bucket: Bucket.Ingreso },
      ];

      const result = await repo.asignarCategorizacion(
        USER_ID,
        ingestaId,
        asignaciones,
      );
      const updateMany = prisma.transaccion.updateMany as Mock;
      const txFn = prisma.$transaction as Mock;

      expect(result.isOk()).toBe(true);
      expect(txFn).toHaveBeenCalledTimes(1);
      expect(updateMany).toHaveBeenCalledTimes(2);

      const supermercadoCall = updateMany.mock.calls.find(
        (call) => call[0].data.bucketId === BUCKET_IDS[Bucket.Necesidades],
      );
      expect(supermercadoCall).toBeDefined();
      expect(supermercadoCall![0].where.id.in).toEqual(['tx-1', 'tx-2']);
      expect(supermercadoCall![0].data.categoriaId).toBe(
        'own-supermercado-row-id',
      );
      // Triple lock (Q5): id IN (...) AND ingestaId = ? AND account.userId = ?
      expect(supermercadoCall![0].where.ingestaId).toBe(ingestaId);
      expect(supermercadoCall![0].where.account).toEqual({ userId: USER_ID });

      const ingresoCall = updateMany.mock.calls.find(
        (call) => call[0].data.bucketId === BUCKET_IDS[Bucket.Ingreso],
      );
      expect(ingresoCall).toBeDefined();
      expect(ingresoCall![0].where.id.in).toEqual(['tx-3']);
      expect(ingresoCall![0].data.categoriaId).toBeNull();
      expect(ingresoCall![0].where.ingestaId).toBe(ingestaId);
      expect(ingresoCall![0].where.account).toEqual({ userId: USER_ID });
    });

    it('returns correct total actualizadas count across all groups', async () => {
      const prisma = makePrismaMock();
      const updateMany = prisma.transaccion.updateMany as Mock;
      updateMany
        .mockReset()
        .mockResolvedValueOnce({ count: 3 })
        .mockResolvedValueOnce({ count: 2 });
      const repo = new PrismaTransaccionBucketRepository(prisma);

      const asignaciones = [
        {
          transaccionId: 'tx-1',
          categoriaId: 'own-supermercado-row-id',
          bucket: Bucket.Necesidades,
        },
        {
          transaccionId: 'tx-2',
          categoriaId: 'own-supermercado-row-id',
          bucket: Bucket.Necesidades,
        },
        {
          transaccionId: 'tx-3',
          categoriaId: 'own-supermercado-row-id',
          bucket: Bucket.Necesidades,
        },
        {
          transaccionId: 'tx-4',
          categoriaId: 'own-streaming-row-id',
          bucket: Bucket.Deseos,
        },
        {
          transaccionId: 'tx-5',
          categoriaId: 'own-streaming-row-id',
          bucket: Bucket.Deseos,
        },
      ];

      const result = await repo.asignarCategorizacion(
        USER_ID,
        'ingesta-xyz',
        asignaciones,
      );

      expect(result.isOk()).toBe(true);
      expect(result.getValue().actualizadas).toBe(5);
    });

    it('two DIFFERENT categoriaIds sharing the SAME bucket produce two separate groups', async () => {
      const prisma = makePrismaMock();
      const updateMany = prisma.transaccion.updateMany as Mock;
      const repo = new PrismaTransaccionBucketRepository(prisma);

      const asignaciones = [
        {
          transaccionId: 'tx-1',
          categoriaId: 'own-supermercado-row-id',
          bucket: Bucket.Necesidades,
        },
        {
          transaccionId: 'tx-2',
          categoriaId: 'own-combustible-row-id',
          bucket: Bucket.Necesidades,
        },
      ];

      await repo.asignarCategorizacion(USER_ID, 'ingesta-1', asignaciones);

      expect(updateMany).toHaveBeenCalledTimes(2);
      const supermercadoCall = updateMany.mock.calls.find(
        (call) => call[0].data.categoriaId === 'own-supermercado-row-id',
      );
      const combustibleCall = updateMany.mock.calls.find(
        (call) => call[0].data.categoriaId === 'own-combustible-row-id',
      );
      expect(supermercadoCall![0].where.id.in).toEqual(['tx-1']);
      expect(combustibleCall![0].where.id.in).toEqual(['tx-2']);
    });

    it('returns Result.fail(CategorizacionFallidaError) when $transaction throws', async () => {
      const prisma = makePrismaMock({ throws: new Error('database error') });
      const repo = new PrismaTransaccionBucketRepository(prisma);

      const asignaciones = [
        {
          transaccionId: 'tx-1',
          categoriaId: 'own-supermercado-row-id',
          bucket: Bucket.Necesidades,
        },
      ];

      const result = await repo.asignarCategorizacion(
        USER_ID,
        'ingesta-1',
        asignaciones,
      );

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CategorizacionFallidaError);
      expect(result.getError().causa).toBeInstanceOf(Error);
    });

    it('never throws even when $transaction throws (returns Result.fail)', async () => {
      const prisma = makePrismaMock({ throws: new Error('connection lost') });
      const repo = new PrismaTransaccionBucketRepository(prisma);

      const asignaciones = [
        {
          transaccionId: 'tx-1',
          categoriaId: null,
          bucket: Bucket.SinCategoria,
        },
      ];
      await expect(
        repo.asignarCategorizacion(USER_ID, 'ingesta-1', asignaciones),
      ).resolves.toBeDefined();
      const result = await repo.asignarCategorizacion(
        USER_ID,
        'ingesta-1',
        asignaciones,
      );
      expect(result.isFail()).toBe(true);
    });

    it('writes the handed categoriaId + bucketId verbatim, with ingestaId + account.userId scope lock', async () => {
      const prisma = makePrismaMock();
      const updateMany = prisma.transaccion.updateMany as Mock;
      const repo = new PrismaTransaccionBucketRepository(prisma);

      await repo.asignarCategorizacion(USER_ID, 'ingesta-scope-test', [
        {
          transaccionId: 'tx-1',
          categoriaId: 'own-ahorro-row-id',
          bucket: Bucket.Ahorro,
        },
      ]);

      expect(updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['tx-1'] },
          ingestaId: 'ingesta-scope-test',
          account: { userId: USER_ID },
        },
        data: {
          categoriaId: 'own-ahorro-row-id',
          bucketId: BUCKET_IDS[Bucket.Ahorro],
        },
      });
    });

    it('maps a null categoriaId verbatim (Ingreso / SinCategoria rows)', async () => {
      const prisma = makePrismaMock();
      const updateMany = prisma.transaccion.updateMany as Mock;
      const repo = new PrismaTransaccionBucketRepository(prisma);

      await repo.asignarCategorizacion(USER_ID, 'ingesta-1', [
        {
          transaccionId: 'tx-1',
          categoriaId: null,
          bucket: Bucket.SinCategoria,
        },
      ]);

      expect(updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['tx-1'] },
          ingestaId: 'ingesta-1',
          account: { userId: USER_ID },
        },
        data: {
          categoriaId: null,
          bucketId: BUCKET_IDS[Bucket.SinCategoria],
        },
      });
    });

    // ---------------------------------------------------------------------
    // ADR-037/Q5: la resolución categoría → id físico ya ocurrió río arriba
    // (CategorizarTransaccionUseCase, contra el catálogo real del usuario).
    // El writer NUNCA consulta `categoria` — ni siquiera un solo lookup.
    // ---------------------------------------------------------------------
    it('never issues a categoria.findMany — no lookup, no map, no throw (Q5)', async () => {
      const prisma = makePrismaMock();
      const findMany = prisma.categoria.findMany as Mock;
      const repo = new PrismaTransaccionBucketRepository(prisma);

      await repo.asignarCategorizacion(USER_ID, 'ingesta-1', [
        {
          transaccionId: 'tx-1',
          categoriaId: 'own-supermercado-row-id',
          bucket: Bucket.Necesidades,
        },
        {
          transaccionId: 'tx-2',
          categoriaId: 'own-streaming-row-id',
          bucket: Bucket.Deseos,
        },
      ]);

      expect(findMany).not.toHaveBeenCalled();
    });
  });
});
