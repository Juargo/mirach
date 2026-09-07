import type { Mock } from 'vitest';
import { PrismaCategoriaRepository } from './prisma-categoria.repository';
import { Prisma, PrismaClient } from '@prisma/client';
import { Bucket } from '../../domain/value-objects/bucket';
import { CategoriaNoEncontradaError } from '../../domain/errors/categoria-no-encontrada.error';
import { NombreCategoriaDuplicadoError } from '../../domain/errors/nombre-categoria-duplicado.error';
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

      const resultado = await repo.crearConPatrones(USER_ID, {
        nombre: 'Mascotas',
        bucket: 'Deseos',
        patrones: [],
      });

      expect(resultado.isOk()).toBe(true);
      expect(resultado.getValue().transaccionesCount).toBe(0);
    });
  });

  describe('actualizar()', () => {
    it('issues a single update, NO transaction, when bucket is absent from the patch', async () => {
      const prisma = makePrismaMock();
      (prisma.categoria.update as Mock).mockResolvedValue(
        categoriaRow({ nombre: 'Renombrada' }),
      );
      const repo = new PrismaCategoriaRepository(prisma);

      await repo.actualizar(USER_ID, 'cat-1', {
        nombre: 'Renombrada',
        nombreEfectivo: 'Renombrada',
      });

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

      await repo.actualizar(USER_ID, 'cat-1', {
        bucket: 'Necesidades',
        nombreEfectivo: 'Mascotas',
      });

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

  /**
   * P2002 → 409, no 500.
   *
   * `existeNombre` (use case) es un check-then-act: entre esa lectura y este
   * write hay una ventana TOCTOU. Sin este catch, la unique
   * `Categoria(userId, bucketId, nombre)` (ADR-042) escapa como
   * `PrismaClientKnownRequestError` cruda hasta `errorMiddleware` y el
   * cliente recibe un 500 opaco en lugar del 409 NOMBRE_DUPLICADO que el
   * MISMO endpoint ya devuelve cuando gana el gate de dominio.
   *
   * Discriminación fail-closed: un P2002 cuyo `meta` no nombra
   * explícitamente esta unique RE-LANZA. Un 500 visible es mejor que decirle
   * "ese nombre ya existe" a alguien cuya colisión real fue otra cosa (misma
   * política que `apuntaA` en `prisma-user-credential.repository.ts`, e
   * inversa a la de `esCarreraDeCreacionUser`, que allá es conservadora a
   * propósito).
   */
  describe('P2002 de la unique (userId, bucketId, nombre) → NombreCategoriaDuplicadoError', () => {
    function p2002(meta: unknown) {
      return new Prisma.PrismaClientKnownRequestError('unique violation', {
        code: 'P2002',
        clientVersion: 'test',
        meta: meta as Record<string, unknown>,
      });
    }

    /** Forma REAL de Prisma 7 + @prisma/adapter-pg (no puebla meta.target). */
    const META_ADAPTER = {
      driverAdapterError: {
        cause: {
          constraint: { fields: ['"userId"', '"bucketId"', '"nombre"'] },
          originalMessage:
            'duplicate key value violates unique constraint "Categoria_userId_bucketId_nombre_key"',
        },
      },
    };

    it('crearConPatrones: devuelve Result.fail(NombreCategoriaDuplicadoError) con el nombre que se intentó escribir', async () => {
      const prisma = makePrismaMock();
      (prisma.categoria.create as Mock).mockRejectedValue(p2002(META_ADAPTER));
      const repo = new PrismaCategoriaRepository(prisma);

      const resultado = await repo.crearConPatrones(USER_ID, {
        nombre: 'Mascotas',
        bucket: 'Deseos',
        patrones: [],
      });

      expect(resultado.isFail()).toBe(true);
      const error = resultado.getError();
      expect(error).toBeInstanceOf(NombreCategoriaDuplicadoError);
      expect(error.rawValue).toBe('Mascotas');
    });

    it('crearConPatrones: también reconoce la forma clásica meta.target: string[]', async () => {
      const prisma = makePrismaMock();
      (prisma.categoria.create as Mock).mockRejectedValue(
        p2002({ target: ['userId', 'bucketId', 'nombre'] }),
      );
      const repo = new PrismaCategoriaRepository(prisma);

      const resultado = await repo.crearConPatrones(USER_ID, {
        nombre: 'Mascotas',
        bucket: 'Deseos',
        patrones: [],
      });

      expect(resultado.isFail()).toBe(true);
    });

    it('crearConPatrones: RE-LANZA un P2002 que NO nombra esta unique (fail-closed — no mentir sobre la causa)', async () => {
      const prisma = makePrismaMock();
      (prisma.categoria.create as Mock).mockRejectedValue(
        p2002({ target: ['emailBlindIndex'] }),
      );
      const repo = new PrismaCategoriaRepository(prisma);

      await expect(
        repo.crearConPatrones(USER_ID, {
          nombre: 'Mascotas',
          bucket: 'Deseos',
          patrones: [],
        }),
      ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    });

    it('crearConPatrones: RE-LANZA un P2002 sin forma reconocible en meta (fail-closed)', async () => {
      const prisma = makePrismaMock();
      (prisma.categoria.create as Mock).mockRejectedValue(p2002(undefined));
      const repo = new PrismaCategoriaRepository(prisma);

      await expect(
        repo.crearConPatrones(USER_ID, {
          nombre: 'Mascotas',
          bucket: 'Deseos',
          patrones: [],
        }),
      ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    });

    it('crearConPatrones: RE-LANZA cualquier error que no sea P2002 — una falla de infraestructura no es un resultado de negocio', async () => {
      const prisma = makePrismaMock();
      (prisma.categoria.create as Mock).mockRejectedValue(
        new Error('connection reset'),
      );
      const repo = new PrismaCategoriaRepository(prisma);

      await expect(
        repo.crearConPatrones(USER_ID, {
          nombre: 'Mascotas',
          bucket: 'Deseos',
          patrones: [],
        }),
      ).rejects.toThrow('connection reset');
    });

    it('actualizar (sin bucket, update suelto): mapea el P2002 usando nombreEfectivo', async () => {
      const prisma = makePrismaMock();
      (prisma.categoria.update as Mock).mockRejectedValue(p2002(META_ADAPTER));
      const repo = new PrismaCategoriaRepository(prisma);

      const resultado = await repo.actualizar(USER_ID, 'cat-1', {
        nombre: 'Mascotas',
        nombreEfectivo: 'Mascotas',
      });

      expect(resultado.isFail()).toBe(true);
      expect(resultado.getError()).toBeInstanceOf(
        NombreCategoriaDuplicadoError,
      );
      expect(resultado.getError().rawValue).toBe('Mascotas');
    });

    it('actualizar (con bucket, dentro del $transaction): mapea el P2002 con el nombre ACTUAL — una mudanza de bucket colisiona por un nombre que el patch nunca menciona', async () => {
      const prisma = makePrismaMock();
      (prisma.$transaction as Mock).mockRejectedValue(p2002(META_ADAPTER));
      const repo = new PrismaCategoriaRepository(prisma);

      const resultado = await repo.actualizar(USER_ID, 'cat-1', {
        bucket: 'Necesidades',
        nombreEfectivo: 'Mascotas',
      });

      expect(resultado.isFail()).toBe(true);
      expect(resultado.getError().rawValue).toBe('Mascotas');
    });

    it('actualizar: RE-LANZA un P2002 ajeno a esta unique (fail-closed)', async () => {
      const prisma = makePrismaMock();
      (prisma.categoria.update as Mock).mockRejectedValue(
        p2002({ target: ['tokenHash'] }),
      );
      const repo = new PrismaCategoriaRepository(prisma);

      await expect(
        repo.actualizar(USER_ID, 'cat-1', {
          nombre: 'Mascotas',
          nombreEfectivo: 'Mascotas',
        }),
      ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
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
