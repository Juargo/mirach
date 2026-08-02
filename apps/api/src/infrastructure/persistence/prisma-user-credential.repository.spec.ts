import type { Mock } from 'vitest';
import { PrismaUserCredentialRepository } from './prisma-user-credential.repository';
import { PrismaClient } from '@prisma/client';
import { Email } from '../../domain/value-objects/email';
import type { ICryptoService } from '../../application/ports/crypto-service.port';
import type { IBlindIndexService } from '../../application/ports/blind-index-service.port';

/**
 * Unit tests for PrismaUserCredentialRepository — mocked PrismaClient
 * (mirrors PrismaTransaccionClasificacionRepository's convention). The
 * DB-backed behavior (real unique constraints, real null handling) is
 * covered by the deferred e2e/integration suite, not here.
 *
 * US-035: crypto/blindIndex are fakes here (not the real AES-GCM/HMAC
 * adapters) — this spec only asserts the repository WIRES to them
 * correctly (queries by blind index, decrypts before returning), not that
 * the crypto primitives themselves are correct (that's
 * aes-gcm-crypto.service.spec.ts / hmac-blind-index.service.spec.ts).
 */
function makePrismaMock(userFindUniqueResult: unknown) {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue(userFindUniqueResult),
    },
  } as unknown as PrismaClient;
}

function makeCrypto(decryptFn?: (v: string) => string): ICryptoService {
  return {
    encrypt: (v: string) => v,
    decrypt: decryptFn ?? ((v: string) => v),
  };
}

function makeBlindIndex(computeFn?: (v: string) => string): IBlindIndexService {
  return {
    compute: computeFn ?? ((v: string) => `blind:${v}`),
  };
}

describe('PrismaUserCredentialRepository', () => {
  describe('buscarPorEmail()', () => {
    it('consulta por emailBlindIndex (no por email en claro) — US-035', async () => {
      const prisma = makePrismaMock({
        id: 'user-1',
        passwordHash: '$argon2id$hash',
      });
      const blindIndex = makeBlindIndex((v) => `blind:${v}`);
      const repo = new PrismaUserCredentialRepository(
        prisma,
        makeCrypto(),
        blindIndex,
      );
      const email = Email.crear('user@example.com').getValue();

      const result = await repo.buscarPorEmail(email);

      expect(result).toEqual({
        userId: 'user-1',
        passwordHash: '$argon2id$hash',
      });
      expect(prisma.user.findUnique as Mock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { emailBlindIndex: 'blind:user@example.com' },
        }),
      );
    });

    it('retorna null cuando el email es desconocido', async () => {
      const prisma = makePrismaMock(null);
      const repo = new PrismaUserCredentialRepository(
        prisma,
        makeCrypto(),
        makeBlindIndex(),
      );
      const email = Email.crear('unknown@example.com').getValue();

      const result = await repo.buscarPorEmail(email);

      expect(result).toBeNull();
    });

    it('retorna null cuando el usuario existe pero no tiene passwordHash (sin credenciales)', async () => {
      const prisma = makePrismaMock({ id: 'user-2', passwordHash: null });
      const repo = new PrismaUserCredentialRepository(
        prisma,
        makeCrypto(),
        makeBlindIndex(),
      );
      const email = Email.crear('sin-password@example.com').getValue();

      const result = await repo.buscarPorEmail(email);

      expect(result).toBeNull();
    });
  });

  describe('buscarIdentidad()', () => {
    it('retorna IdentidadUsuario con el email DESCIFRADO cuando el userId existe con email (usuario real) — US-035', async () => {
      const prisma = {
        user: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'user-1',
            email: 'cifrado-xyz',
            esDemo: false,
          }),
        },
      } as unknown as PrismaClient;
      const repo = new PrismaUserCredentialRepository(
        prisma,
        makeCrypto((v) => `plano:${v}`),
        makeBlindIndex(),
      );

      const result = await repo.buscarIdentidad('user-1');

      expect(result).toEqual({
        userId: 'user-1',
        email: 'plano:cifrado-xyz',
        esDemo: false,
      });
    });

    it('retorna null cuando el userId no existe', async () => {
      const prisma = {
        user: { findUnique: vi.fn().mockResolvedValue(null) },
      } as unknown as PrismaClient;
      const repo = new PrismaUserCredentialRepository(
        prisma,
        makeCrypto(),
        makeBlindIndex(),
      );

      const result = await repo.buscarIdentidad('inexistente');

      expect(result).toBeNull();
    });

    it('retorna null cuando el userId existe pero no tiene email y NO es demo (defensivo)', async () => {
      const prisma = {
        user: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'user-inconsistente',
            email: null,
            esDemo: false,
          }),
        },
      } as unknown as PrismaClient;
      const crypto = makeCrypto();
      const decryptSpy = vi.spyOn(crypto, 'decrypt');
      const repo = new PrismaUserCredentialRepository(
        prisma,
        crypto,
        makeBlindIndex(),
      );

      const result = await repo.buscarIdentidad('user-inconsistente');

      expect(result).toBeNull();
      expect(decryptSpy).not.toHaveBeenCalled();
    });

    it('retorna IdentidadUsuario con email=null y esDemo=true para un usuario demo (DEMO-AUTH-05) — nunca llama a decrypt()', async () => {
      const prisma = {
        user: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'user-demo-1',
            email: null,
            esDemo: true,
          }),
        },
      } as unknown as PrismaClient;
      const crypto = makeCrypto();
      const decryptSpy = vi.spyOn(crypto, 'decrypt');
      const repo = new PrismaUserCredentialRepository(
        prisma,
        crypto,
        makeBlindIndex(),
      );

      const result = await repo.buscarIdentidad('user-demo-1');

      expect(result).toEqual({
        userId: 'user-demo-1',
        email: null,
        esDemo: true,
      });
      expect(decryptSpy).not.toHaveBeenCalled();
    });
  });
});
