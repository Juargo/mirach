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
      const findUnique = vi
        .fn()
        .mockResolvedValue({ userId: 'user-1', expiresAt });
      const prisma = { session: { findUnique } } as unknown as PrismaClient;
      const repo = new PrismaSessionRepository(prisma);

      const result = await repo.buscarPorTokenHash('hash-abc');

      expect(result).toEqual({ userId: 'user-1', expiresAt });
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
});
