import type { Mock } from 'vitest';
import { PrismaUserCredentialRepository } from './prisma-user-credential.repository';
import { PrismaService } from './prisma.service';
import { Email } from '../../domain/value-objects/email';

/**
 * Unit tests for PrismaUserCredentialRepository — mocked PrismaService
 * (mirrors PrismaTransaccionClasificacionRepository's convention). The
 * DB-backed behavior (real unique constraints, real null handling) is
 * covered by the deferred e2e/integration suite, not here.
 */
function makePrismaMock(userFindUniqueResult: unknown) {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue(userFindUniqueResult),
    },
  } as unknown as PrismaService;
}

describe('PrismaUserCredentialRepository', () => {
  describe('buscarPorEmail()', () => {
    it('retorna CredencialUsuario cuando el email existe y tiene passwordHash', async () => {
      const prisma = makePrismaMock({
        id: 'user-1',
        passwordHash: '$argon2id$hash',
      });
      const repo = new PrismaUserCredentialRepository(prisma);
      const email = Email.crear('user@example.com').getValue();

      const result = await repo.buscarPorEmail(email);

      expect(result).toEqual({ userId: 'user-1', passwordHash: '$argon2id$hash' });
      expect(prisma.user.findUnique as Mock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { email: 'user@example.com' } }),
      );
    });

    it('retorna null cuando el email es desconocido', async () => {
      const prisma = makePrismaMock(null);
      const repo = new PrismaUserCredentialRepository(prisma);
      const email = Email.crear('unknown@example.com').getValue();

      const result = await repo.buscarPorEmail(email);

      expect(result).toBeNull();
    });

    it('retorna null cuando el usuario existe pero no tiene passwordHash (sin credenciales)', async () => {
      const prisma = makePrismaMock({ id: 'user-2', passwordHash: null });
      const repo = new PrismaUserCredentialRepository(prisma);
      const email = Email.crear('sin-password@example.com').getValue();

      const result = await repo.buscarPorEmail(email);

      expect(result).toBeNull();
    });
  });

  describe('buscarIdentidad()', () => {
    it('retorna IdentidadUsuario cuando el userId existe con email', async () => {
      const prisma = {
        user: {
          findUnique: vi
            .fn()
            .mockResolvedValue({ id: 'user-1', email: 'user@example.com' }),
        },
      } as unknown as PrismaService;
      const repo = new PrismaUserCredentialRepository(prisma);

      const result = await repo.buscarIdentidad('user-1');

      expect(result).toEqual({ userId: 'user-1', email: 'user@example.com' });
    });

    it('retorna null cuando el userId no existe', async () => {
      const prisma = {
        user: { findUnique: vi.fn().mockResolvedValue(null) },
      } as unknown as PrismaService;
      const repo = new PrismaUserCredentialRepository(prisma);

      const result = await repo.buscarIdentidad('inexistente');

      expect(result).toBeNull();
    });

    it('retorna null cuando el userId existe pero no tiene email (defensivo)', async () => {
      const prisma = {
        user: {
          findUnique: vi.fn().mockResolvedValue({ id: 'user-3', email: null }),
        },
      } as unknown as PrismaService;
      const repo = new PrismaUserCredentialRepository(prisma);

      const result = await repo.buscarIdentidad('user-3');

      expect(result).toBeNull();
    });
  });
});
