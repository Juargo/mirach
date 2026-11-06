import type { Mock } from 'vitest';
import { PrismaPatronRepository } from './prisma-patron.repository';
import { PrismaClient } from '@prisma/client';

const USER_ID = 'user-owner-of-this-catalog';

function makePrismaMock() {
  const patronClasificacion = {
    findFirst: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  return { patronClasificacion } as unknown as PrismaClient;
}

function patronRow(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: 'pat-1',
    categoriaId: 'cat-1',
    patron: 'netflix',
    matchType: 'CONTAINS',
    prioridad: 100,
    ...overrides,
  };
}

describe('PrismaPatronRepository', () => {
  describe('buscarPorId()', () => {
    it('filters by userId in the SQL WHERE (RNF-SEC-006)', async () => {
      const prisma = makePrismaMock();
      const repo = new PrismaPatronRepository(prisma);

      await repo.buscarPorId(USER_ID, 'pat-1');

      expect(prisma.patronClasificacion.findFirst).toHaveBeenCalledWith({
        where: { id: 'pat-1', userId: USER_ID },
      });
    });

    it('returns null when the row is absent or not owned', async () => {
      const prisma = makePrismaMock();
      const repo = new PrismaPatronRepository(prisma);

      await expect(repo.buscarPorId(USER_ID, 'pat-x')).resolves.toBeNull();
    });

    it('maps the row to the Patron shape', async () => {
      const prisma = makePrismaMock();
      (prisma.patronClasificacion.findFirst as Mock).mockResolvedValue(
        patronRow(),
      );
      const repo = new PrismaPatronRepository(prisma);

      await expect(repo.buscarPorId(USER_ID, 'pat-1')).resolves.toEqual({
        id: 'pat-1',
        categoriaId: 'cat-1',
        patron: 'netflix',
        matchType: 'CONTAINS',
        prioridad: 100,
      });
    });
  });

  describe('buscarPorTexto()', () => {
    const fila = (id: string, patron: string) => ({
      id,
      patron,
      categoria: {
        id: 'cat-cafes',
        nombre: 'Cafés',
        bucket: { nombre: 'Deseos' },
      },
    });

    it("reads only the caller's patterns: userId in the SQL WHERE (RNF-SEC-006)", async () => {
      const prisma = makePrismaMock();
      const repo = new PrismaPatronRepository(prisma);

      await repo.buscarPorTexto(USER_ID, 'netflix');

      expect(prisma.patronClasificacion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: USER_ID } }),
      );
    });

    it('folds case and accents (CLA-17): "cafe" finds "Café" with its category', async () => {
      const prisma = makePrismaMock();
      (prisma.patronClasificacion.findMany as Mock).mockResolvedValue([
        fila('pat-1', 'netflix'),
        fila('pat-2', 'Café'),
      ]);
      const repo = new PrismaPatronRepository(prisma);

      await expect(repo.buscarPorTexto(USER_ID, 'cafe')).resolves.toEqual({
        patronId: 'pat-2',
        categoriaId: 'cat-cafes',
        categoria: 'Cafés',
        bucket: 'Deseos',
      });
    });

    it('excludes the given id (PATCH self-exclusion)', async () => {
      const prisma = makePrismaMock();
      (prisma.patronClasificacion.findMany as Mock).mockResolvedValue([
        fila('pat-2', 'café'),
      ]);
      const repo = new PrismaPatronRepository(prisma);

      await expect(
        repo.buscarPorTexto(USER_ID, 'cafe', 'pat-2'),
      ).resolves.toBeNull();
    });
  });

  describe('crear()', () => {
    it('writes userId + categoriaId; the composite FK (categoriaId, userId) → Categoria(id, userId) is the DB-level cross-tenant refusal', async () => {
      const prisma = makePrismaMock();
      (prisma.patronClasificacion.create as Mock).mockResolvedValue(
        patronRow(),
      );
      const repo = new PrismaPatronRepository(prisma);

      await repo.crear(USER_ID, {
        categoriaId: 'cat-1',
        patron: 'netflix',
        matchType: 'CONTAINS',
        prioridad: 100,
      });

      expect(prisma.patronClasificacion.create).toHaveBeenCalledWith({
        data: {
          userId: USER_ID,
          categoriaId: 'cat-1',
          patron: 'netflix',
          matchType: 'CONTAINS',
          prioridad: 100,
        },
      });
    });
  });

  describe('actualizar()', () => {
    it('filters by userId in the SQL WHERE and writes only the patched fields', async () => {
      const prisma = makePrismaMock();
      (prisma.patronClasificacion.update as Mock).mockResolvedValue(
        patronRow({ prioridad: 5 }),
      );
      const repo = new PrismaPatronRepository(prisma);

      await repo.actualizar(USER_ID, 'pat-1', { prioridad: 5 });

      expect(prisma.patronClasificacion.update).toHaveBeenCalledWith({
        where: { id: 'pat-1', userId: USER_ID },
        data: { prioridad: 5 },
      });
    });
  });

  describe('eliminar()', () => {
    it('filters by userId in the SQL WHERE', async () => {
      const prisma = makePrismaMock();
      const repo = new PrismaPatronRepository(prisma);

      await repo.eliminar(USER_ID, 'pat-1');

      expect(prisma.patronClasificacion.deleteMany).toHaveBeenCalledWith({
        where: { id: 'pat-1', userId: USER_ID },
      });
    });

    it('returns true when the delete count is 1', async () => {
      const prisma = makePrismaMock();
      const repo = new PrismaPatronRepository(prisma);

      await expect(repo.eliminar(USER_ID, 'pat-1')).resolves.toBe(true);
    });

    it('returns false when the delete count is 0 (absent or not owned)', async () => {
      const prisma = makePrismaMock();
      (prisma.patronClasificacion.deleteMany as Mock).mockResolvedValue({
        count: 0,
      });
      const repo = new PrismaPatronRepository(prisma);

      await expect(repo.eliminar(USER_ID, 'pat-x')).resolves.toBe(false);
    });
  });
});
