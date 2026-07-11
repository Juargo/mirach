import { PrismaTransaccionBucketRepository } from './prisma-transaccion-bucket.repository';
import { PrismaService } from './prisma.service';
import { Bucket } from '../../domain/value-objects/bucket';
import { CategorizacionFallidaError } from '../../domain/errors/categorizacion-fallida.error';
import { BUCKET_IDS } from './bucket-ids';

/**
 * When `throws` is set, `$transaction` rejects — simulating a DB-level error.
 * updateMany still returns a pending promise; $transaction is the one that fails.
 */
function makePrismaMock(throws?: Error) {
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  // $transaction receives an array of already-resolved promises (Prisma batch style)
  const transaction = jest.fn(async (promises: Promise<unknown>[]) => {
    if (throws) throw throws;
    return Promise.all(promises);
  });
  return {
    transaccion: { updateMany },
    $transaction: transaction,
  } as unknown as PrismaService;
}

describe('PrismaTransaccionBucketRepository', () => {
  describe('asignarBuckets()', () => {
    it('returns Result.ok({ actualizadas: 0 }) for empty array (edge case)', async () => {
      const prisma = makePrismaMock();
      const repo = new PrismaTransaccionBucketRepository(prisma);

      const result = await repo.asignarBuckets('ingesta-1', []);

      expect(result.isOk()).toBe(true);
      expect(result.getValue().actualizadas).toBe(0);
      expect((prisma.$transaction as jest.Mock).mock.calls.length).toBe(0);
    });

    it('calls $transaction with updateMany calls grouped by bucket, with ingestaId scope lock', async () => {
      const updateMany = jest.fn().mockResolvedValue({ count: 2 });
      const txFn = jest.fn(async (promises: Promise<unknown>[]) => {
        return Promise.all(promises);
      });
      const prisma = {
        transaccion: { updateMany },
        $transaction: txFn,
      } as unknown as PrismaService;
      const repo = new PrismaTransaccionBucketRepository(prisma);

      const ingestaId = 'ingesta-abc-123';
      const asignaciones = [
        { transaccionId: 'tx-1', bucket: Bucket.Necesidades },
        { transaccionId: 'tx-2', bucket: Bucket.Necesidades },
        { transaccionId: 'tx-3', bucket: Bucket.Ingreso },
      ];

      const result = await repo.asignarBuckets(ingestaId, asignaciones);

      expect(result.isOk()).toBe(true);
      // Should have called $transaction once
      expect(txFn).toHaveBeenCalledTimes(1);
      // updateMany should have been called twice (one per unique bucket)
      expect(updateMany).toHaveBeenCalledTimes(2);
      // Check updateMany called with correct args for Necesidades group
      const necesidadesCall = updateMany.mock.calls.find(
        (call) => call[0].data.bucketId === BUCKET_IDS[Bucket.Necesidades],
      );
      expect(necesidadesCall).toBeDefined();
      expect(necesidadesCall![0].where.id.in).toEqual(['tx-1', 'tx-2']);
      // SCOPE ISOLATION: ingestaId must be in the WHERE clause (double-lock)
      expect(necesidadesCall![0].where.ingestaId).toBe(ingestaId);
      // Check updateMany called with correct args for Ingreso group
      const ingresoCall = updateMany.mock.calls.find(
        (call) => call[0].data.bucketId === BUCKET_IDS[Bucket.Ingreso],
      );
      expect(ingresoCall).toBeDefined();
      expect(ingresoCall![0].where.id.in).toEqual(['tx-3']);
      expect(ingresoCall![0].where.ingestaId).toBe(ingestaId);
    });

    it('returns correct total actualizadas count across all groups', async () => {
      const updateMany = jest.fn()
        .mockResolvedValueOnce({ count: 3 })
        .mockResolvedValueOnce({ count: 2 });
      const txFn = jest.fn(async (promises: Promise<unknown>[]) => Promise.all(promises));
      const prisma = {
        transaccion: { updateMany },
        $transaction: txFn,
      } as unknown as PrismaService;
      const repo = new PrismaTransaccionBucketRepository(prisma);

      const asignaciones = [
        { transaccionId: 'tx-1', bucket: Bucket.Necesidades },
        { transaccionId: 'tx-2', bucket: Bucket.Necesidades },
        { transaccionId: 'tx-3', bucket: Bucket.Necesidades },
        { transaccionId: 'tx-4', bucket: Bucket.Deseos },
        { transaccionId: 'tx-5', bucket: Bucket.Deseos },
      ];

      const result = await repo.asignarBuckets('ingesta-xyz', asignaciones);

      expect(result.isOk()).toBe(true);
      expect(result.getValue().actualizadas).toBe(5);
    });

    it('returns Result.fail(CategorizacionFallidaError) when $transaction throws', async () => {
      const prisma = makePrismaMock(new Error('database error'));
      const repo = new PrismaTransaccionBucketRepository(prisma);

      const asignaciones = [{ transaccionId: 'tx-1', bucket: Bucket.Necesidades }];

      const result = await repo.asignarBuckets('ingesta-1', asignaciones);

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CategorizacionFallidaError);
      expect((result.getError() as CategorizacionFallidaError).causa).toBeInstanceOf(Error);
    });

    it('never throws even when $transaction throws (returns Result.fail)', async () => {
      const prisma = makePrismaMock(new Error('connection lost'));
      const repo = new PrismaTransaccionBucketRepository(prisma);

      const asignaciones = [{ transaccionId: 'tx-1', bucket: Bucket.SinCategoria }];
      await expect(repo.asignarBuckets('ingesta-1', asignaciones)).resolves.toBeDefined();
      const result = await repo.asignarBuckets('ingesta-1', asignaciones);
      expect(result.isFail()).toBe(true);
    });

    it('maps Bucket enum to correct BUCKET_IDS string in updateMany call, with ingestaId scope lock', async () => {
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });
      const txFn = jest.fn(async (promises: Promise<unknown>[]) => Promise.all(promises));
      const prisma = {
        transaccion: { updateMany },
        $transaction: txFn,
      } as unknown as PrismaService;
      const repo = new PrismaTransaccionBucketRepository(prisma);

      await repo.asignarBuckets('ingesta-scope-test', [{ transaccionId: 'tx-1', bucket: Bucket.Ahorro }]);

      expect(updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['tx-1'] }, ingestaId: 'ingesta-scope-test' },
        data: { bucketId: BUCKET_IDS[Bucket.Ahorro] },
      });
    });
  });
});
