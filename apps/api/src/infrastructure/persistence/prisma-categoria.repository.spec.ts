import type { Mock } from 'vitest';
import { PrismaCategoriaRepository } from './prisma-categoria.repository';
import { PrismaClient } from '@prisma/client';
import { Bucket } from '../../domain/value-objects/bucket';
import { CategoriaNoEncontradaError } from '../../domain/errors/categoria-no-encontrada.error';
import { BUCKET_IDS } from './bucket-ids';

const USER_ID = 'user-owner-of-this-catalog';

/**
 * The fake `$transaction` supports the SINGLE Prisma call style this
 * adapter uses post-US-039: array form (`actualizar`'s re-stamp, D-07; and
 * `eliminar`'s children-first delete, design.md §4). Both statements have
 * no interdependent reads, so neither needs the interactive callback form —
 * `Promise.all` mirrors Prisma's array-form semantics closely enough for
 * a unit fake.
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

  describe('existeNombre() — criterion object, bucket-scoped (ADR-042, D-02)', () => {
    it('filters by userId + bucketId + case-insensitive nombre in the SQL WHERE', async () => {
      const prisma = makePrismaMock();
      const repo = new PrismaCategoriaRepository(prisma);

      await repo.existeNombre({
        userId: USER_ID,
        nombre: 'mascotas',
        bucket: Bucket.Deseos,
      });

      expect(prisma.categoria.findFirst).toHaveBeenCalledWith({
        where: {
          userId: USER_ID,
          bucketId: BUCKET_IDS[Bucket.Deseos],
          nombre: { equals: 'mascotas', mode: 'insensitive' },
        },
        select: { id: true },
      });
    });

    it('excludes the given id (PATCH self-exclusion)', async () => {
      const prisma = makePrismaMock();
      const repo = new PrismaCategoriaRepository(prisma);

      await repo.existeNombre({
        userId: USER_ID,
        nombre: 'mascotas',
        bucket: Bucket.Deseos,
        excluirId: 'cat-1',
      });

      expect(prisma.categoria.findFirst).toHaveBeenCalledWith({
        where: {
          userId: USER_ID,
          bucketId: BUCKET_IDS[Bucket.Deseos],
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

      await expect(
        repo.existeNombre({
          userId: USER_ID,
          nombre: 'mascotas',
          bucket: Bucket.Deseos,
        }),
      ).resolves.toBe(true);
      (prisma.categoria.findFirst as Mock).mockResolvedValueOnce(null);
      await expect(
        repo.existeNombre({
          userId: USER_ID,
          nombre: 'otro',
          bucket: Bucket.Deseos,
        }),
      ).resolves.toBe(false);
    });
  });

  describe('crearConPatrones() — REEMPLAZA a crear() (design.md D-01, CAT038-10)', () => {
    it('writes userId and resolves BUCKET_IDS[bucket] to the physical id, patrones: [] ⇒ byte-identical to the retired crear()', async () => {
      const prisma = makePrismaMock();
      (prisma.categoria.create as Mock).mockResolvedValue(categoriaRow());
      const repo = new PrismaCategoriaRepository(prisma);

      await repo.crearConPatrones(USER_ID, {
        nombre: 'Mascotas',
        bucket: 'Deseos',
        patrones: [],
      });

      expect(prisma.categoria.create).toHaveBeenCalledWith({
        data: {
          userId: USER_ID,
          nombre: 'Mascotas',
          bucketId: BUCKET_IDS[Bucket.Deseos],
          patrones: { create: [] },
        },
        include: CATEGORIA_INCLUDE_WITH_COUNT,
      });
    });

    it('nested patrones are passed as ONE Prisma statement — no categoriaId/userId in the nested create (Prisma derives both from the composite relation, schema.prisma:176)', async () => {
      const prisma = makePrismaMock();
      (prisma.categoria.create as Mock).mockResolvedValue(categoriaRow());
      const repo = new PrismaCategoriaRepository(prisma);

      await repo.crearConPatrones(USER_ID, {
        nombre: 'Mascotas',
        bucket: 'Deseos',
        patrones: [
          { patron: 'petco', matchType: 'CONTAINS', prioridad: 100 },
          { patron: 'vet', matchType: 'STARTS_WITH', prioridad: 100 },
        ],
      });

      expect(prisma.categoria.create).toHaveBeenCalledTimes(1);
      expect(prisma.categoria.create).toHaveBeenCalledWith({
        data: {
          userId: USER_ID,
          nombre: 'Mascotas',
          bucketId: BUCKET_IDS[Bucket.Deseos],
          patrones: {
            create: [
              { patron: 'petco', matchType: 'CONTAINS', prioridad: 100 },
              { patron: 'vet', matchType: 'STARTS_WITH', prioridad: 100 },
            ],
          },
        },
        include: CATEGORIA_INCLUDE_WITH_COUNT,
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('returned DTO carries transaccionesCount sourced from the include, not hard-coded to 0', async () => {
      const prisma = makePrismaMock();
      (prisma.categoria.create as Mock).mockResolvedValue(
        categoriaRow({ _count: { transacciones: 0 } }),
      );
      const repo = new PrismaCategoriaRepository(prisma);

      const categoria = await repo.crearConPatrones(USER_ID, {
        nombre: 'Mascotas',
        bucket: 'Deseos',
        patrones: [],
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
    it('runs an array-form $transaction: patterns deleted FIRST, then the category — NO in-use predicate (US-039, CAT038-04 as modified)', async () => {
      const prisma = makePrismaMock();
      (prisma.categoria.deleteMany as Mock).mockResolvedValue({ count: 1 });
      const repo = new PrismaCategoriaRepository(prisma);

      const result = await repo.eliminar(USER_ID, 'cat-1');

      expect(result.isOk()).toBe(true);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const [txArg] = (prisma.$transaction as Mock).mock.calls[0];
      expect(Array.isArray(txArg)).toBe(true);
    });

    it('the child deleteMany WHERE deep-equals {categoriaId, userId} EXACTLY — pins the Q4 invariant (dropping userId reopens the cross-tenant delete PrismaEliminarIngestaRepository guards against)', async () => {
      const prisma = makePrismaMock();
      (prisma.categoria.deleteMany as Mock).mockResolvedValue({ count: 1 });
      const repo = new PrismaCategoriaRepository(prisma);

      await repo.eliminar(USER_ID, 'cat-1');

      expect(prisma.patronClasificacion.deleteMany).toHaveBeenCalledWith({
        where: { categoriaId: 'cat-1', userId: USER_ID },
      });
    });

    it('the parent deleteMany WHERE deep-equals {id, userId} EXACTLY — no transacciones key (predicate removal, D-04)', async () => {
      const prisma = makePrismaMock();
      (prisma.categoria.deleteMany as Mock).mockResolvedValue({ count: 1 });
      const repo = new PrismaCategoriaRepository(prisma);

      await repo.eliminar(USER_ID, 'cat-1');

      expect(prisma.categoria.deleteMany).toHaveBeenCalledWith({
        where: { id: 'cat-1', userId: USER_ID },
      });
    });

    it('parent count 1 ⇒ Result.ok', async () => {
      const prisma = makePrismaMock();
      (prisma.categoria.deleteMany as Mock).mockResolvedValue({ count: 1 });
      const repo = new PrismaCategoriaRepository(prisma);

      const result = await repo.eliminar(USER_ID, 'cat-1');

      expect(result.isOk()).toBe(true);
    });

    it('parent count 0 ⇒ Result.fail(CategoriaNoEncontradaError) — absent or not owned, never 409 (US-039)', async () => {
      const prisma = makePrismaMock();
      (prisma.categoria.deleteMany as Mock).mockResolvedValue({ count: 0 });
      const repo = new PrismaCategoriaRepository(prisma);

      const result = await repo.eliminar(USER_ID, 'cat-1');

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CategoriaNoEncontradaError);
    });

    it('categoria.findFirst is NEVER called — no follow-up lookup exists anymore (D-06 sentinel + predicate both removed)', async () => {
      const prisma = makePrismaMock();
      (prisma.categoria.deleteMany as Mock).mockResolvedValue({ count: 1 });
      const repo = new PrismaCategoriaRepository(prisma);

      await repo.eliminar(USER_ID, 'cat-1');

      expect(prisma.categoria.findFirst).not.toHaveBeenCalled();
    });
  });
});
