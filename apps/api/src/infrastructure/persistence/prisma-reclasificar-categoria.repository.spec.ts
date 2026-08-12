import { PrismaReclasificarCategoriaRepository } from './prisma-reclasificar-categoria.repository';
import { PrismaClient } from '@prisma/client';
import { Bucket } from '../../domain/value-objects/bucket';
import { TransaccionNoEncontradaError } from '../../domain/errors/transaccion-no-encontrada.error';
import { CategoriaDesconocidaError } from '../../domain/errors/categoria-desconocida.error';

/**
 * `findUniqueRow` controla lo que devuelve `categoria.findUnique` (la fila
 * REAL, per-user, del usuario que reclasifica — ADR-037, design.md §1 Q5).
 * `updateManyCount` controla el `count` de `transaccion.updateMany`.
 */
function makePrismaMock(options?: {
  findUniqueRow?: {
    id: string;
    bucketId: string;
    bucket: { nombre: string };
  } | null;
  updateManyCount?: number;
}) {
  const findUnique = vi
    .fn()
    .mockResolvedValue(
      options?.findUniqueRow === undefined ? null : options.findUniqueRow,
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
    it('resuelve la categoría por (userId, nombre) del usuario — persiste y retorna el id REAL de esa fila y su bucket', async () => {
      const prisma = makePrismaMock({
        findUniqueRow: {
          id: 'cat-row-owned-by-a',
          bucketId: 'bucket-necesidades-id',
          bucket: { nombre: Bucket.Necesidades },
        },
      });
      const findUnique = prisma.categoria.findUnique as ReturnType<
        typeof vi.fn
      >;
      const updateMany = prisma.transaccion.updateMany as ReturnType<
        typeof vi.fn
      >;
      const repo = new PrismaReclasificarCategoriaRepository(prisma);

      const result = await repo.reasignar('user-a', 'tx-1', 'Transporte');

      expect(findUnique).toHaveBeenCalledWith({
        where: { userId_nombre: { userId: 'user-a', nombre: 'Transporte' } },
        include: { bucket: true },
      });
      expect(updateMany).toHaveBeenCalledWith({
        where: { id: 'tx-1', account: { userId: 'user-a' } },
        data: {
          categoriaId: 'cat-row-owned-by-a',
          bucketId: 'bucket-necesidades-id',
        },
      });
      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toEqual({
        id: 'tx-1',
        categoriaId: 'cat-row-owned-by-a',
        categoria: 'Transporte',
        bucket: Bucket.Necesidades,
      });
    });

    it('dos usuarios reclasificando al mismo nombre obtienen categoriaId DISTINTOS (cada uno resuelve su propia fila)', async () => {
      const prismaA = makePrismaMock({
        findUniqueRow: {
          id: 'cat-a-transporte',
          bucketId: 'bucket-necesidades-id',
          bucket: { nombre: Bucket.Necesidades },
        },
      });
      const prismaB = makePrismaMock({
        findUniqueRow: {
          id: 'cat-b-transporte',
          bucketId: 'bucket-necesidades-id',
          bucket: { nombre: Bucket.Necesidades },
        },
      });
      const repoA = new PrismaReclasificarCategoriaRepository(prismaA);
      const repoB = new PrismaReclasificarCategoriaRepository(prismaB);

      const resultA = await repoA.reasignar('user-a', 'tx-a', 'Transporte');
      const resultB = await repoB.reasignar('user-b', 'tx-b', 'Transporte');

      expect(resultA.getValue().categoriaId).toBe('cat-a-transporte');
      expect(resultB.getValue().categoriaId).toBe('cat-b-transporte');
      expect(resultA.getValue().categoriaId).not.toBe(
        resultB.getValue().categoriaId,
      );
    });

    it('un nombre ausente del catálogo del usuario → Result.fail(CategoriaDesconocidaError) — nunca lanza, nunca enumera', async () => {
      const prisma = makePrismaMock({ findUniqueRow: null });
      const repo = new PrismaReclasificarCategoriaRepository(prisma);

      const result = await repo.reasignar(
        'user-a',
        'tx-1',
        'NombreQueNoExiste',
      );

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CategoriaDesconocidaError);
    });

    it('count === 0 en el updateMany (no existe O no es del usuario) → Result.fail(TransaccionNoEncontradaError) — anti-enumeración', async () => {
      const prisma = makePrismaMock({
        findUniqueRow: {
          id: 'cat-row-owned-by-a',
          bucketId: 'bucket-necesidades-id',
          bucket: { nombre: Bucket.Necesidades },
        },
        updateManyCount: 0,
      });
      const repo = new PrismaReclasificarCategoriaRepository(prisma);

      const result = await repo.reasignar('user-a', 'tx-ajena', 'Transporte');

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(TransaccionNoEncontradaError);
    });

    it('el WHERE del updateMany aísla estructuralmente por account.userId (RNF-SEC-006)', async () => {
      const prisma = makePrismaMock({
        findUniqueRow: {
          id: 'cat-row',
          bucketId: 'bucket-ahorro-id',
          bucket: { nombre: Bucket.Ahorro },
        },
      });
      const updateMany = prisma.transaccion.updateMany as ReturnType<
        typeof vi.fn
      >;
      const repo = new PrismaReclasificarCategoriaRepository(prisma);

      await repo.reasignar('user-scope-test', 'tx-1', 'Ahorro');

      expect(updateMany).toHaveBeenCalledWith({
        where: { id: 'tx-1', account: { userId: 'user-scope-test' } },
        data: {
          categoriaId: 'cat-row',
          bucketId: 'bucket-ahorro-id',
        },
      });
    });
  });
});
