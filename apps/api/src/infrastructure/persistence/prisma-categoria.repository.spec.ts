import type { Mock } from 'vitest';
import { PrismaCategoriaRepository } from './prisma-categoria.repository';
import { PrismaClient } from '@prisma/client';
import { Bucket } from '../../domain/value-objects/bucket';
import { CategoriaNoEncontradaError } from '../../domain/errors/categoria-no-encontrada.error';
import { CategoriaEnUsoError } from '../../domain/errors/categoria-en-uso.error';
import { BUCKET_IDS } from './bucket-ids';

const USER_ID = 'user-owner-of-this-catalog';

/**
 * The fake `$transaction` supports BOTH Prisma call styles used by this
 * adapter: array form (`actualizar`, D-07) and interactive callback form
 * (`eliminar`, D-06). The interactive form receives the SAME mocked client,
 * mirroring how a real `tx` exposes the identical model surface.
 */
function makePrismaMock() {
  const categoria = {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  const patronClasificacion = {
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  };
  const transaccion = {
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
  };
  const prisma = { categoria, patronClasificacion, transaccion };
  const $transaction = vi.fn(async (arg: unknown) => {
    if (typeof arg === 'function') {
      return (arg as (tx: unknown) => Promise<unknown>)(prisma);
    }
    return Promise.all(arg as Promise<unknown>[]);
  });
  return { ...prisma, $transaction } as unknown as PrismaClient;
}

function categoriaRow(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: 'cat-1',
    userId: USER_ID,
    nombre: 'Mascotas',
    bucketId: BUCKET_IDS[Bucket.Deseos],
    bucket: { id: BUCKET_IDS[Bucket.Deseos], nombre: Bucket.Deseos },
    patrones: [],
    _count: { transacciones: 0 },
    ...overrides,
  };
}

const CATEGORIA_INCLUDE_WITH_COUNT = {
  bucket: true,
  patrones: true,
  _count: {
    select: { transacciones: { where: { account: { userId: USER_ID } } } },
  },
};

describe('PrismaCategoriaRepository', () => {
  describe('listarConPatrones()', () => {
    it('filters by userId in the SQL WHERE (RNF-SEC-006) and scopes the transaccionesCount subquery by the SAME userId (CAT039-01)', async () => {
      const prisma = makePrismaMock();
      const repo = new PrismaCategoriaRepository(prisma);

      await repo.listarConPatrones(USER_ID);

      expect(prisma.categoria.findMany).toHaveBeenCalledWith({
        where: { userId: USER_ID },
        include: CATEGORIA_INCLUDE_WITH_COUNT,
        orderBy: { nombre: 'asc' },
      });
    });

    it('maps _count.transacciones → transaccionesCount (12 → 12, 0 → 0, never undefined)', async () => {
      const prisma = makePrismaMock();
      (prisma.categoria.findMany as Mock).mockResolvedValue([
        categoriaRow({ id: 'cat-1', _count: { transacciones: 12 } }),
        categoriaRow({ id: 'cat-2', _count: { transacciones: 0 } }),
      ]);
      const repo = new PrismaCategoriaRepository(prisma);

      const categorias = await repo.listarConPatrones(USER_ID);

      expect(categorias[0]?.transaccionesCount).toBe(12);
      expect(categorias[1]?.transaccionesCount).toBe(0);
      expect(categorias[1]?.transaccionesCount).not.toBeUndefined();
    });

    it('re-orders nested patrones by (prioridad, patron, id) — D-08', async () => {
      const prisma = makePrismaMock();
      (prisma.categoria.findMany as Mock).mockResolvedValue([
        categoriaRow({
          patrones: [
            {
              id: 'p-3',
              categoriaId: 'cat-1',
              patron: 'zeta',
              matchType: 'CONTAINS',
              prioridad: 100,
            },
            {
              id: 'p-1',
              categoriaId: 'cat-1',
              patron: 'alfa',
              matchType: 'CONTAINS',
              prioridad: 50,
            },
            {
              id: 'p-2',
              categoriaId: 'cat-1',
              patron: 'alfa',
              matchType: 'CONTAINS',
              prioridad: 50,
            },
          ],
        }),
      ]);
      const repo = new PrismaCategoriaRepository(prisma);

      const [categoria] = await repo.listarConPatrones(USER_ID);

      expect(categoria.patrones.map((p) => p.id)).toEqual([
        'p-1',
        'p-2',
        'p-3',
      ]);
    });

    it('a zero-pattern category is returned with patrones: [] (CA-03)', async () => {
      const prisma = makePrismaMock();
      (prisma.categoria.findMany as Mock).mockResolvedValue([
        categoriaRow({ patrones: [] }),
      ]);
      const repo = new PrismaCategoriaRepository(prisma);

      const [categoria] = await repo.listarConPatrones(USER_ID);

      expect(categoria.patrones).toEqual([]);
    });
  });

  describe('buscarPorId()', () => {
    it('filters by userId in the SQL WHERE (RNF-SEC-006)', async () => {
      const prisma = makePrismaMock();
      const repo = new PrismaCategoriaRepository(prisma);

      await repo.buscarPorId(USER_ID, 'cat-1');

      expect(prisma.categoria.findFirst).toHaveBeenCalledWith({
        where: { id: 'cat-1', userId: USER_ID },
        include: CATEGORIA_INCLUDE_WITH_COUNT,
      });
    });

    it('returns null when the row is absent or not owned', async () => {
      const prisma = makePrismaMock();
      const repo = new PrismaCategoriaRepository(prisma);

      const result = await repo.buscarPorId(USER_ID, 'cat-x');

      expect(result).toBeNull();
    });
  });

  describe('existeNombre()', () => {
    it('filters by userId + case-insensitive nombre in the SQL WHERE', async () => {
      const prisma = makePrismaMock();
      const repo = new PrismaCategoriaRepository(prisma);

      await repo.existeNombre(USER_ID, 'mascotas');

      expect(prisma.categoria.findFirst).toHaveBeenCalledWith({
        where: {
          userId: USER_ID,
          nombre: { equals: 'mascotas', mode: 'insensitive' },
        },
        select: { id: true },
      });
    });

    it('excludes the given id (PATCH self-exclusion)', async () => {
      const prisma = makePrismaMock();
      const repo = new PrismaCategoriaRepository(prisma);

      await repo.existeNombre(USER_ID, 'mascotas', 'cat-1');

      expect(prisma.categoria.findFirst).toHaveBeenCalledWith({
        where: {
          userId: USER_ID,
          nombre: { equals: 'mascotas', mode: 'insensitive' },
          id: { not: 'cat-1' },
        },
        select: { id: true },
      });
    });

    it('returns true when a row is found, false otherwise', async () => {
      const prisma = makePrismaMock();
      (prisma.categoria.findFirst as Mock).mockResolvedValueOnce({
        id: 'cat-1',
      });
      const repo = new PrismaCategoriaRepository(prisma);

      await expect(repo.existeNombre(USER_ID, 'mascotas')).resolves.toBe(true);
      (prisma.categoria.findFirst as Mock).mockResolvedValueOnce(null);
      await expect(repo.existeNombre(USER_ID, 'otro')).resolves.toBe(false);
    });
  });

  describe('crear()', () => {
    it('writes userId and resolves BUCKET_IDS[bucket] to the physical id', async () => {
      const prisma = makePrismaMock();
      (prisma.categoria.create as Mock).mockResolvedValue(categoriaRow());
      const repo = new PrismaCategoriaRepository(prisma);

      await repo.crear(USER_ID, { nombre: 'Mascotas', bucket: 'Deseos' });

      expect(prisma.categoria.create).toHaveBeenCalledWith({
        data: {
          userId: USER_ID,
          nombre: 'Mascotas',
          bucketId: BUCKET_IDS[Bucket.Deseos],
        },
        include: CATEGORIA_INCLUDE_WITH_COUNT,
      });
    });

    it('returned DTO carries transaccionesCount sourced from the include, not hard-coded to 0', async () => {
      const prisma = makePrismaMock();
      (prisma.categoria.create as Mock).mockResolvedValue(
        categoriaRow({ _count: { transacciones: 0 } }),
      );
      const repo = new PrismaCategoriaRepository(prisma);

      const categoria = await repo.crear(USER_ID, {
        nombre: 'Mascotas',
        bucket: 'Deseos',
      });

      expect(categoria.transaccionesCount).toBe(0);
    });
  });

  describe('actualizar()', () => {
    it('issues a single update, NO transaction, when bucket is absent from the patch', async () => {
      const prisma = makePrismaMock();
      (prisma.categoria.update as Mock).mockResolvedValue(
        categoriaRow({ nombre: 'Renombrada' }),
      );
      const repo = new PrismaCategoriaRepository(prisma);

      await repo.actualizar(USER_ID, 'cat-1', { nombre: 'Renombrada' });

      expect(prisma.categoria.update).toHaveBeenCalledWith({
        where: { id: 'cat-1', userId: USER_ID },
        data: { nombre: 'Renombrada' },
        include: CATEGORIA_INCLUDE_WITH_COUNT,
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.transaccion.updateMany).not.toHaveBeenCalled();
    });

    it('issues the re-stamp updateMany INSIDE prisma.$transaction([update, updateMany]) (array form) when bucket IS present — D-07', async () => {
      const prisma = makePrismaMock();
      (prisma.categoria.update as Mock).mockResolvedValue(
        categoriaRow({
          bucket: {
            id: BUCKET_IDS[Bucket.Necesidades],
            nombre: Bucket.Necesidades,
          },
        }),
      );
      const repo = new PrismaCategoriaRepository(prisma);

      await repo.actualizar(USER_ID, 'cat-1', { bucket: 'Necesidades' });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const [txArg] = (prisma.$transaction as Mock).mock.calls[0];
      expect(Array.isArray(txArg)).toBe(true);
      expect(prisma.categoria.update).toHaveBeenCalledWith({
        where: { id: 'cat-1', userId: USER_ID },
        data: { bucketId: BUCKET_IDS[Bucket.Necesidades] },
        include: CATEGORIA_INCLUDE_WITH_COUNT,
      });
      expect(prisma.transaccion.updateMany).toHaveBeenCalledWith({
        where: { categoriaId: 'cat-1', account: { userId: USER_ID } },
        data: { bucketId: BUCKET_IDS[Bucket.Necesidades] },
      });
    });
  });

  describe('eliminar()', () => {
    it('runs an interactive $transaction: patterns deleted first, then the category with the in-use predicate INSIDE the delete statement — D-06', async () => {
      const prisma = makePrismaMock();
      (prisma.categoria.deleteMany as Mock).mockResolvedValue({ count: 1 });
      const repo = new PrismaCategoriaRepository(prisma);

      const result = await repo.eliminar(USER_ID, 'cat-1');

      expect(result.isOk()).toBe(true);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const [txArg] = (prisma.$transaction as Mock).mock.calls[0];
      expect(typeof txArg).toBe('function');
      expect(prisma.patronClasificacion.deleteMany).toHaveBeenCalledWith({
        where: { categoriaId: 'cat-1', userId: USER_ID },
      });
      expect(prisma.categoria.deleteMany).toHaveBeenCalledWith({
        where: { id: 'cat-1', userId: USER_ID, transacciones: { none: {} } },
      });
    });

    it('returns Result.fail(CategoriaEnUsoError) when the delete count is 0 AND a follow-up userId-scoped lookup finds the row (409, in use)', async () => {
      const prisma = makePrismaMock();
      (prisma.categoria.deleteMany as Mock).mockResolvedValue({ count: 0 });
      (prisma.categoria.findFirst as Mock).mockResolvedValue({ id: 'cat-1' });
      const repo = new PrismaCategoriaRepository(prisma);

      const result = await repo.eliminar(USER_ID, 'cat-1');

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CategoriaEnUsoError);
      expect(prisma.categoria.findFirst).toHaveBeenCalledWith({
        where: { id: 'cat-1', userId: USER_ID },
        select: { id: true },
      });
    });

    it('returns Result.fail(CategoriaNoEncontradaError) when the delete count is 0 AND the follow-up lookup finds nothing (404, absent or not owned)', async () => {
      const prisma = makePrismaMock();
      (prisma.categoria.deleteMany as Mock).mockResolvedValue({ count: 0 });
      (prisma.categoria.findFirst as Mock).mockResolvedValue(null);
      const repo = new PrismaCategoriaRepository(prisma);

      const result = await repo.eliminar(USER_ID, 'cat-1');

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CategoriaNoEncontradaError);
    });

    it('the follow-up lookup runs OUTSIDE the transaction (only after count === 0)', async () => {
      const prisma = makePrismaMock();
      (prisma.categoria.deleteMany as Mock).mockResolvedValue({ count: 1 });
      const repo = new PrismaCategoriaRepository(prisma);

      await repo.eliminar(USER_ID, 'cat-1');

      expect(prisma.categoria.findFirst).not.toHaveBeenCalled();
    });
  });
});
