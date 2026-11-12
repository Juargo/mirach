import type { Mock } from 'vitest';
import { PrismaSessionRepository } from './prisma-session.repository';
import { PrismaClient } from '@prisma/client';

/**
 * Unit tests for PrismaSessionRepository — mocked PrismaClient.
 * DB-backed behavior (real unique constraint on tokenHash, real cascade)
 * is covered by the deferred e2e/integration suite.
 */
describe('PrismaSessionRepository', () => {
  describe('crear()', () => {
    it('crea la sesión con userId, tokenHash y expiresAt', async () => {
      const create = vi.fn().mockResolvedValue({});
      const prisma = { session: { create } } as unknown as PrismaClient;
      const repo = new PrismaSessionRepository(prisma);
      const expiresAt = new Date('2026-07-25T00:00:00.000Z');

      await repo.crear({ userId: 'user-1', tokenHash: 'hash-abc', expiresAt });

      expect(create as Mock).toHaveBeenCalledWith({
        data: { userId: 'user-1', tokenHash: 'hash-abc', expiresAt },
      });
    });
  });

  describe('buscarPorTokenHash()', () => {
    it('retorna SesionPersistida cuando el hash existe', async () => {
      const expiresAt = new Date('2026-07-25T00:00:00.000Z');
      const findUnique = vi.fn().mockResolvedValue({
        userId: 'user-1',
        expiresAt,
        user: { appleSub: null, googleSub: 'google-sub', passwordHash: null },
      });
      const prisma = { session: { findUnique } } as unknown as PrismaClient;
      const repo = new PrismaSessionRepository(prisma);

      const result = await repo.buscarPorTokenHash('hash-abc');

      expect(result).toEqual({
        userId: 'user-1',
        expiresAt,
        anonima: false,
      });
      expect(findUnique as Mock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tokenHash: 'hash-abc' } }),
      );
    });

    it('retorna null cuando el hash es desconocido', async () => {
      const findUnique = vi.fn().mockResolvedValue(null);
      const prisma = { session: { findUnique } } as unknown as PrismaClient;
      const repo = new PrismaSessionRepository(prisma);

      const result = await repo.buscarPorTokenHash('hash-inexistente');

      expect(result).toBeNull();
    });
  });

  describe('revocarPorTokenHash()', () => {
    it('borra la fila cuando el hash existe', async () => {
      const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
      const prisma = { session: { deleteMany } } as unknown as PrismaClient;
      const repo = new PrismaSessionRepository(prisma);

      await repo.revocarPorTokenHash('hash-abc');

      expect(deleteMany as Mock).toHaveBeenCalledWith({
        where: { tokenHash: 'hash-abc' },
      });
    });

    it('es idempotente: un hash inexistente no lanza (deleteMany no falla)', async () => {
      const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
      const prisma = { session: { deleteMany } } as unknown as PrismaClient;
      const repo = new PrismaSessionRepository(prisma);

      await expect(
        repo.revocarPorTokenHash('hash-inexistente'),
      ).resolves.toBeUndefined();
    });
  });

  describe('revocarOtrasPorUserId() — PERF040-06', () => {
    it('deleteMany where deep-equals {userId, tokenHash: {not: tokenHashActual}} — el "not" es el punto entero', async () => {
      const deleteMany = vi.fn().mockResolvedValue({ count: 2 });
      const prisma = { session: { deleteMany } } as unknown as PrismaClient;
      const repo = new PrismaSessionRepository(prisma);

      await repo.revocarOtrasPorUserId('user-1', 'hash-de-a');

      expect(deleteMany as Mock).toHaveBeenCalledWith({
        where: { userId: 'user-1', tokenHash: { not: 'hash-de-a' } },
      });
    });

    it('es idempotente: 0 filas borradas es éxito, no falla', async () => {
      const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
      const prisma = { session: { deleteMany } } as unknown as PrismaClient;
      const repo = new PrismaSessionRepository(prisma);

      await expect(
        repo.revocarOtrasPorUserId('user-1', 'hash-de-a'),
      ).resolves.toBeUndefined();
    });
  });

  describe('cuenta anónima (ADR-013)', () => {
    const expiresAt = new Date('2027-11-12T00:00:00.000Z');

    function repoCon(user: Record<string, string | null>) {
      const findUnique = vi
        .fn()
        .mockResolvedValue({ userId: 'user-1', expiresAt, user });
      const repo = new PrismaSessionRepository({
        session: { findUnique },
      } as unknown as PrismaClient);
      return { repo, findUnique };
    }

    it('marca anonima la sesión de un usuario sin appleSub, googleSub ni passwordHash', async () => {
      const { repo, findUnique } = repoCon({
        appleSub: null,
        googleSub: null,
        passwordHash: null,
      });

      const result = await repo.buscarPorTokenHash('hash-abc');

      expect(result).toEqual({ userId: 'user-1', expiresAt, anonima: true });
      expect(findUnique as Mock).toHaveBeenCalledWith({
        where: { tokenHash: 'hash-abc' },
        select: {
          userId: true,
          expiresAt: true,
          user: {
            select: { appleSub: true, googleSub: true, passwordHash: true },
          },
        },
      });
    });

    it.each([
      ['appleSub', { appleSub: 'a', googleSub: null, passwordHash: null }],
      ['googleSub', { appleSub: null, googleSub: 'g', passwordHash: null }],
      ['passwordHash', { appleSub: null, googleSub: null, passwordHash: 'h' }],
    ])('no es anónima si el usuario tiene %s', async (_campo, user) => {
      const { repo } = repoCon(user);

      const result = await repo.buscarPorTokenHash('hash-abc');

      expect(result?.anonima).toBe(false);
    });

    it('renovar() actualiza solo el vencimiento de ese tokenHash', async () => {
      const updateMany = vi.fn().mockResolvedValue({ count: 1 });
      const repo = new PrismaSessionRepository({
        session: { updateMany },
      } as unknown as PrismaClient);

      await repo.renovar('hash-abc', expiresAt);

      expect(updateMany as Mock).toHaveBeenCalledWith({
        where: { tokenHash: 'hash-abc' },
        data: { expiresAt },
      });
    });
  });
});
