import type { Mock } from 'vitest';
import { PrismaReevaluarCategoriasWriter } from './prisma-reevaluar-categorias.writer';
import { PrismaClient } from '@prisma/client';
import { Bucket } from '../../domain/value-objects/bucket';
import { CategorizacionFallidaError } from '../../domain/errors/categorizacion-fallida.error';
import { BUCKET_IDS } from './bucket-ids';

const USER_ID = 'user-owner';

/**
 * PrismaReevaluarCategoriasWriter — mirrors
 * `prisma-transaccion-bucket.repository.spec.ts` (grouping by
 * categoriaId+bucket, verbatim writes, error → Result.fail) MENOS el scope
 * de `ingestaId` (acá el alcance es TODO el historial del usuario) MÁS la
 * cobertura de chunking acotado (PR #200 — nunca N updates sueltos ni un
 * único statement gigante).
 */
function makePrismaMock(options?: { throws?: Error }) {
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const transaction = vi.fn(async (promises: Promise<unknown>[]) => {
    if (options?.throws) throw options.throws;
    return Promise.all(promises);
  });
  return {
    transaccion: { updateMany },
    $transaction: transaction,
  } as unknown as PrismaClient;
}

describe('PrismaReevaluarCategoriasWriter', () => {
  it('returns Result.ok({ actualizadas: 0 }) for an empty array, without touching the DB', async () => {
    const prisma = makePrismaMock();
    const writer = new PrismaReevaluarCategoriasWriter(prisma);

    const result = await writer.escribir(USER_ID, []);

    expect(result.isOk()).toBe(true);
    expect(result.getValue().actualizadas).toBe(0);
    expect((prisma.$transaction as Mock).mock.calls.length).toBe(0);
  });

  it('groups by (categoriaId, bucket) and scopes the WHERE to { id IN (...), account: { userId } } — no ingestaId', async () => {
    const prisma = makePrismaMock();
    const writer = new PrismaReevaluarCategoriasWriter(prisma);

    await writer.escribir(USER_ID, [
      {
        transaccionId: 'tx-1',
        categoriaId: 'cat-supermercado',
        bucket: Bucket.Necesidades,
      },
      {
        transaccionId: 'tx-2',
        categoriaId: 'cat-supermercado',
        bucket: Bucket.Necesidades,
      },
      { transaccionId: 'tx-3', categoriaId: null, bucket: Bucket.Ingreso },
    ]);

    const updateMany = prisma.transaccion.updateMany as Mock;
    expect(updateMany).toHaveBeenCalledTimes(2);

    const supermercadoCall = updateMany.mock.calls.find(
      (call) => call[0].data.categoriaId === 'cat-supermercado',
    );
    expect(supermercadoCall![0]).toEqual({
      where: { id: { in: ['tx-1', 'tx-2'] }, account: { userId: USER_ID } },
      data: {
        categoriaId: 'cat-supermercado',
        bucketId: BUCKET_IDS[Bucket.Necesidades],
      },
    });

    const ingresoCall = updateMany.mock.calls.find(
      (call) => call[0].data.categoriaId === null,
    );
    expect(ingresoCall![0]).toEqual({
      where: { id: { in: ['tx-3'] }, account: { userId: USER_ID } },
      data: { categoriaId: null, bucketId: BUCKET_IDS[Bucket.Ingreso] },
    });
  });

  it('sums actualizadas across every updateMany group', async () => {
    const prisma = makePrismaMock();
    const updateMany = prisma.transaccion.updateMany as Mock;
    updateMany
      .mockReset()
      .mockResolvedValueOnce({ count: 3 })
      .mockResolvedValueOnce({ count: 2 });
    const writer = new PrismaReevaluarCategoriasWriter(prisma);

    const result = await writer.escribir(USER_ID, [
      {
        transaccionId: 'tx-1',
        categoriaId: 'cat-a',
        bucket: Bucket.Necesidades,
      },
      {
        transaccionId: 'tx-2',
        categoriaId: 'cat-a',
        bucket: Bucket.Necesidades,
      },
      {
        transaccionId: 'tx-3',
        categoriaId: 'cat-a',
        bucket: Bucket.Necesidades,
      },
      { transaccionId: 'tx-4', categoriaId: 'cat-b', bucket: Bucket.Deseos },
      { transaccionId: 'tx-5', categoriaId: 'cat-b', bucket: Bucket.Deseos },
    ]);

    expect(result.isOk()).toBe(true);
    expect(result.getValue().actualizadas).toBe(5);
  });

  it('PR #200: chunkea un grupo grande en varios updateMany acotados (nunca un único statement gigante)', async () => {
    const prisma = makePrismaMock();
    const updateMany = prisma.transaccion.updateMany as Mock;
    const writer = new PrismaReevaluarCategoriasWriter(prisma);

    // 750 filas en el MISMO grupo (categoriaId, bucket) — por encima del cap
    // de ids por statement (500) debe partirse en 2 updateMany.
    const asignaciones = Array.from({ length: 750 }, (_, i) => ({
      transaccionId: `tx-${i}`,
      categoriaId: 'cat-a',
      bucket: Bucket.Necesidades,
    }));

    await writer.escribir(USER_ID, asignaciones);

    expect(updateMany.mock.calls.length).toBeGreaterThan(1);
    const totalIdsEscritos = updateMany.mock.calls.reduce(
      (sum, call) => sum + (call[0].where.id.in as string[]).length,
      0,
    );
    expect(totalIdsEscritos).toBe(750);
    for (const call of updateMany.mock.calls) {
      expect((call[0].where.id.in as string[]).length).toBeLessThanOrEqual(500);
    }
  });

  it('PR #200: nunca manda N updates sueltos — las operaciones viajan agrupadas en $transaction con timeout explícito', async () => {
    const prisma = makePrismaMock();
    const writer = new PrismaReevaluarCategoriasWriter(prisma);

    // 25 grupos distintos (categoriaId único cada uno) → por encima del cap
    // de operaciones por $transaction (20) debe partirse en ≥2 llamadas a
    // $transaction, cada una con timeout/maxWait explícitos.
    const asignaciones = Array.from({ length: 25 }, (_, i) => ({
      transaccionId: `tx-${i}`,
      categoriaId: `cat-${i}`,
      bucket: Bucket.Necesidades,
    }));

    await writer.escribir(USER_ID, asignaciones);

    const txFn = prisma.$transaction as Mock;
    expect(txFn.mock.calls.length).toBeGreaterThan(1);
    for (const call of txFn.mock.calls) {
      expect(call[1]).toEqual(
        expect.objectContaining({
          timeout: expect.any(Number),
          maxWait: expect.any(Number),
        }),
      );
    }
  });

  it('returns Result.fail(CategorizacionFallidaError) when $transaction throws, without propagating', async () => {
    const prisma = makePrismaMock({ throws: new Error('database error') });
    const writer = new PrismaReevaluarCategoriasWriter(prisma);

    const result = await writer.escribir(USER_ID, [
      {
        transaccionId: 'tx-1',
        categoriaId: 'cat-a',
        bucket: Bucket.Necesidades,
      },
    ]);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CategorizacionFallidaError);
    expect(result.getError().causa).toBeInstanceOf(Error);
  });

  it('two different categoriaIds sharing the same bucket produce two separate groups', async () => {
    const prisma = makePrismaMock();
    const updateMany = prisma.transaccion.updateMany as Mock;
    const writer = new PrismaReevaluarCategoriasWriter(prisma);

    await writer.escribir(USER_ID, [
      {
        transaccionId: 'tx-1',
        categoriaId: 'cat-supermercado',
        bucket: Bucket.Necesidades,
      },
      {
        transaccionId: 'tx-2',
        categoriaId: 'cat-combustible',
        bucket: Bucket.Necesidades,
      },
    ]);

    expect(updateMany).toHaveBeenCalledTimes(2);
  });
});
