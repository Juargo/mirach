import { PrismaReclasificarCategoriaRepository } from './prisma-reclasificar-categoria.repository';
import { PrismaClient } from '@prisma/client';
import { Bucket } from '../../domain/value-objects/bucket';
import { TransaccionNoEncontradaError } from '../../domain/errors/transaccion-no-encontrada.error';
import { CategoriaDesconocidaError } from '../../domain/errors/categoria-desconocida.error';

/**
 * `findFirstRow` controla lo que devuelve `categoria.findFirst` (la fila
 * REAL, per-user, del usuario que reclasifica — ADR-037/ADR-042, design.md
 * D-05). `updateManyCount` controla el `count` de `transaccion.updateMany`.
 */
function makePrismaMock(options?: {
  findFirstRow?: {
    id: string;
    nombre: string;
    bucketId: string;
    bucket: { nombre: string };
  } | null;
  updateManyCount?: number;
}) {
  const findFirst = vi
    .fn()
    .mockResolvedValue(
      options?.findFirstRow === undefined ? null : options.findFirstRow,
    );
  const updateMany = vi
    .fn()
    .mockResolvedValue({ count: options?.updateManyCount ?? 1 });
  return {
    categoria: { findFirst },
    transaccion: { updateMany },
  } as unknown as PrismaClient;
}

describe('PrismaReclasificarCategoriaRepository', () => {
  describe('reasignar()', () => {
    it('resuelve la categoría por (id, userId) — REGRESSION GUARD (D-05): la forma prohibida findFirst({ userId, nombre }) NUNCA debe reaparecer, porque devuelve una de N filas homónimas entre buckets', async () => {
      const prisma = makePrismaMock({
        findFirstRow: {
          id: 'cat-row-owned-by-a',
          nombre: 'Transporte',
          bucketId: 'bucket-necesidades-id',
          bucket: { nombre: Bucket.Necesidades },
        },
      });
      const findFirst = prisma.categoria.findFirst as ReturnType<typeof vi.fn>;
      const updateMany = prisma.transaccion.updateMany as ReturnType<
        typeof vi.fn
      >;
      const repo = new PrismaReclasificarCategoriaRepository(prisma);

      const result = await repo.reasignar(
        'user-a',
        'tx-1',
        'cat-row-owned-by-a',
      );

      expect(findFirst).toHaveBeenCalledWith({
        where: { id: 'cat-row-owned-by-a', userId: 'user-a' },
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
      // `categoria` en el DTO se lee de la fila resuelta, NUNCA se hace eco
      // del input (design.md D-06) — el id de entrada no es un nombre.
      expect(result.getValue()).toEqual({
        id: 'tx-1',
        categoriaId: 'cat-row-owned-by-a',
        categoria: 'Transporte',
        bucket: Bucket.Necesidades,
      });
    });

    it('dos usuarios reclasificando con ids distintos obtienen categoriaId DISTINTOS (cada uno resuelve su propia fila por id+userId)', async () => {
      const prismaA = makePrismaMock({
        findFirstRow: {
          id: 'cat-a-transporte',
          nombre: 'Transporte',
          bucketId: 'bucket-necesidades-id',
          bucket: { nombre: Bucket.Necesidades },
        },
      });
      const prismaB = makePrismaMock({
        findFirstRow: {
          id: 'cat-b-transporte',
          nombre: 'Transporte',
          bucketId: 'bucket-necesidades-id',
          bucket: { nombre: Bucket.Necesidades },
        },
      });
      const repoA = new PrismaReclasificarCategoriaRepository(prismaA);
      const repoB = new PrismaReclasificarCategoriaRepository(prismaB);

      const resultA = await repoA.reasignar(
        'user-a',
        'tx-a',
        'cat-a-transporte',
      );
      const resultB = await repoB.reasignar(
        'user-b',
        'tx-b',
        'cat-b-transporte',
      );

      expect(resultA.getValue().categoriaId).toBe('cat-a-transporte');
      expect(resultB.getValue().categoriaId).toBe('cat-b-transporte');
      expect(resultA.getValue().categoriaId).not.toBe(
        resultB.getValue().categoriaId,
      );
    });

    it('un categoriaId ausente del catálogo del usuario (no existe o no es suyo) → Result.fail(CategoriaDesconocidaError) — nunca lanza, nunca enumera', async () => {
      const prisma = makePrismaMock({ findFirstRow: null });
      const repo = new PrismaReclasificarCategoriaRepository(prisma);

      const result = await repo.reasignar(
        'user-a',
        'tx-1',
        'cat-id-que-no-existe',
      );

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CategoriaDesconocidaError);
    });

    it('count === 0 en el updateMany (no existe O no es del usuario) → Result.fail(TransaccionNoEncontradaError) — anti-enumeración', async () => {
      const prisma = makePrismaMock({
        findFirstRow: {
          id: 'cat-row-owned-by-a',
          nombre: 'Transporte',
          bucketId: 'bucket-necesidades-id',
          bucket: { nombre: Bucket.Necesidades },
        },
        updateManyCount: 0,
      });
      const repo = new PrismaReclasificarCategoriaRepository(prisma);

      const result = await repo.reasignar(
        'user-a',
        'tx-ajena',
        'cat-row-owned-by-a',
      );

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(TransaccionNoEncontradaError);
    });

    it('el WHERE del lookup aísla estructuralmente por userId (RNF-SEC-006) y el del updateMany por account.userId', async () => {
      const prisma = makePrismaMock({
        findFirstRow: {
          id: 'cat-row',
          nombre: 'Ahorro',
          bucketId: 'bucket-ahorro-id',
          bucket: { nombre: Bucket.Ahorro },
        },
      });
      const findFirst = prisma.categoria.findFirst as ReturnType<typeof vi.fn>;
      const updateMany = prisma.transaccion.updateMany as ReturnType<
        typeof vi.fn
      >;
      const repo = new PrismaReclasificarCategoriaRepository(prisma);

      await repo.reasignar('user-scope-test', 'tx-1', 'cat-row');

      expect(findFirst).toHaveBeenCalledWith({
        where: { id: 'cat-row', userId: 'user-scope-test' },
        include: { bucket: true },
      });

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
