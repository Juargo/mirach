import { PrismaReclasificarCategoriaRepository } from './prisma-reclasificar-categoria.repository';
import { PrismaClient } from '@prisma/client';
import { Bucket } from '../../domain/value-objects/bucket';
import { Categoria } from '../../domain/value-objects/categoria';
import { TransaccionNoEncontradaError } from '../../domain/errors/transaccion-no-encontrada.error';
import { BUCKET_IDS } from './bucket-ids';

/**
 * `findUniqueId` controla lo que devuelve `categoria.findUnique` (la fila
 * REAL, per-user, del usuario que reclasifica — US-037, design.md §4.3).
 * `updateManyCount` controla el `count` de `transaccion.updateMany`.
 */
function makePrismaMock(options?: {
  findUniqueId?: string | null;
  updateManyCount?: number;
}) {
  const findUnique = vi
    .fn()
    .mockResolvedValue(
      options?.findUniqueId === undefined || options.findUniqueId === null
        ? null
        : { id: options.findUniqueId },
    );
  const updateMany = vi
    .fn()
    .mockResolvedValue({ count: options?.updateManyCount ?? 1 });
  return {
    categoria: { findUnique },
    transaccion: { updateMany },
  } as unknown as PrismaClient;
}

describe('PrismaReclasificarCategoriaRepository', () => {
  describe('reasignar()', () => {
    it('resuelve la categoría por (userId, nombre) del usuario — persiste y retorna el id REAL de esa fila', async () => {
      const prisma = makePrismaMock({ findUniqueId: 'cat-row-owned-by-a' });
      const findUnique = prisma.categoria.findUnique as ReturnType<
        typeof vi.fn
      >;
      const updateMany = prisma.transaccion.updateMany as ReturnType<
        typeof vi.fn
      >;
      const repo = new PrismaReclasificarCategoriaRepository(prisma);

      const result = await repo.reasignar(
        'user-a',
        'tx-1',
        Categoria.Transporte,
        Bucket.Necesidades,
      );

      expect(findUnique).toHaveBeenCalledWith({
        where: {
          userId_nombre: { userId: 'user-a', nombre: Categoria.Transporte },
        },
        select: { id: true },
      });
      expect(updateMany).toHaveBeenCalledWith({
        where: { id: 'tx-1', account: { userId: 'user-a' } },
        data: {
          categoriaId: 'cat-row-owned-by-a',
          bucketId: BUCKET_IDS[Bucket.Necesidades],
        },
      });
      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toEqual({
        id: 'tx-1',
        categoriaId: 'cat-row-owned-by-a',
        categoria: Categoria.Transporte,
        bucket: Bucket.Necesidades,
      });
    });

    it('dos usuarios reclasificando al mismo nombre obtienen categoriaId DISTINTOS (cada uno resuelve su propia fila)', async () => {
      const prismaA = makePrismaMock({ findUniqueId: 'cat-a-transporte' });
      const prismaB = makePrismaMock({ findUniqueId: 'cat-b-transporte' });
      const repoA = new PrismaReclasificarCategoriaRepository(prismaA);
      const repoB = new PrismaReclasificarCategoriaRepository(prismaB);

      const resultA = await repoA.reasignar(
        'user-a',
        'tx-a',
        Categoria.Transporte,
        Bucket.Necesidades,
      );
      const resultB = await repoB.reasignar(
        'user-b',
        'tx-b',
        Categoria.Transporte,
        Bucket.Necesidades,
      );

      expect(resultA.getValue().categoriaId).toBe('cat-a-transporte');
      expect(resultB.getValue().categoriaId).toBe('cat-b-transporte');
      expect(resultA.getValue().categoriaId).not.toBe(
        resultB.getValue().categoriaId,
      );
    });

    it('la fila de categoría no existe (catálogo corrupto/copia rota) → LANZA — nunca Result.fail(TransaccionNoEncontradaError)', async () => {
      const prisma = makePrismaMock({ findUniqueId: null });
      const repo = new PrismaReclasificarCategoriaRepository(prisma);

      // Deliberado (design.md §4.3): un catálogo roto es un fallo estructural
      // (500), no "transacción no encontrada" (404) — reportar not-found acá
      // enviaría el debugging en la dirección equivocada.
      await expect(
        repo.reasignar(
          'user-a',
          'tx-1',
          Categoria.Transporte,
          Bucket.Necesidades,
        ),
      ).rejects.toThrow();
    });

    it('count === 0 en el updateMany (no existe O no es del usuario) → Result.fail(TransaccionNoEncontradaError) — anti-enumeración', async () => {
      const prisma = makePrismaMock({
        findUniqueId: 'cat-row-owned-by-a',
        updateManyCount: 0,
      });
      const repo = new PrismaReclasificarCategoriaRepository(prisma);

      const result = await repo.reasignar(
        'user-a',
        'tx-ajena',
        Categoria.Transporte,
        Bucket.Necesidades,
      );

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(TransaccionNoEncontradaError);
    });

    it('el WHERE del updateMany aísla estructuralmente por account.userId (RNF-SEC-006)', async () => {
      const prisma = makePrismaMock({ findUniqueId: 'cat-row' });
      const updateMany = prisma.transaccion.updateMany as ReturnType<
        typeof vi.fn
      >;
      const repo = new PrismaReclasificarCategoriaRepository(prisma);

      await repo.reasignar(
        'user-scope-test',
        'tx-1',
        Categoria.Ahorro,
        Bucket.Ahorro,
      );

      expect(updateMany).toHaveBeenCalledWith({
        where: { id: 'tx-1', account: { userId: 'user-scope-test' } },
        data: {
          categoriaId: 'cat-row',
          bucketId: BUCKET_IDS[Bucket.Ahorro],
        },
      });
    });
  });
});
