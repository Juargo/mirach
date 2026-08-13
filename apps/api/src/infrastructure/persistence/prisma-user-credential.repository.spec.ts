import type { Mock } from 'vitest';
import { PrismaUserCredentialRepository } from './prisma-user-credential.repository';
import { Prisma, PrismaClient } from '@prisma/client';
import { Email } from '../../domain/value-objects/email';
import { EmailNoDisponibleError } from '../../domain/errors/email-no-disponible.error';
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
      update: vi.fn(),
    },
  } as unknown as PrismaClient;
}

function makePrismaUpdateMock() {
  return {
    user: { update: vi.fn().mockResolvedValue({}) },
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
            nombre: 'Jorge',
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
        nombre: 'Jorge',
        email: 'plano:cifrado-xyz',
        esDemo: false,
      });
      expect((prisma.user.findUnique as Mock).mock.calls[0][0]).toEqual(
        expect.objectContaining({
          select: expect.objectContaining({ nombre: true }),
        }),
      );
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
            nombre: 'Alguien',
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
            nombre: 'Demo',
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
        nombre: 'Demo',
        email: null,
        esDemo: true,
      });
      expect(decryptSpy).not.toHaveBeenCalled();
    });
  });

  describe('buscarCredencialPorId() — PERF040-03', () => {
    it('retorna CredencialUsuario cuando el userId existe con passwordHash', async () => {
      const prisma = {
        user: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'user-1',
            passwordHash: '$argon2id$hash',
          }),
        },
      } as unknown as PrismaClient;
      const repo = new PrismaUserCredentialRepository(
        prisma,
        makeCrypto(),
        makeBlindIndex(),
      );

      const result = await repo.buscarCredencialPorId('user-1');

      expect(result).toEqual({
        userId: 'user-1',
        passwordHash: '$argon2id$hash',
      });
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        select: { id: true, passwordHash: true },
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

      expect(await repo.buscarCredencialPorId('ghost')).toBeNull();
    });

    it('retorna null cuando el usuario existe pero no tiene passwordHash (login solo-Google, §1/Q3)', async () => {
      const prisma = {
        user: {
          findUnique: vi
            .fn()
            .mockResolvedValue({ id: 'user-google', passwordHash: null }),
        },
      } as unknown as PrismaClient;
      const repo = new PrismaUserCredentialRepository(
        prisma,
        makeCrypto(),
        makeBlindIndex(),
      );

      expect(await repo.buscarCredencialPorId('user-google')).toBeNull();
    });

    it('nunca selecciona/retorna el campo email (ISP — CredencialUsuario no debe cargar PII)', async () => {
      const findUnique = vi
        .fn()
        .mockResolvedValue({ id: 'user-1', passwordHash: '$argon2id$hash' });
      const prisma = { user: { findUnique } } as unknown as PrismaClient;
      const repo = new PrismaUserCredentialRepository(
        prisma,
        makeCrypto(),
        makeBlindIndex(),
      );

      await repo.buscarCredencialPorId('user-1');

      const select = (findUnique.mock.calls[0][0] as { select: object }).select;
      expect(select).not.toHaveProperty('email');
    });
  });

  describe('actualizarPerfil() — PERF040-01/02, design.md §4.1', () => {
    it('nombre-only: el data enviado a update() SOLO tiene la clave nombre (Object.keys deep-equal) — §1/Q4a', async () => {
      const update = vi.fn().mockResolvedValue({
        id: 'user-1',
        nombre: 'Nuevo Nombre',
        email: 'cipher:jorge@example.com',
        esDemo: false,
      });
      const prisma = { user: { update } } as unknown as PrismaClient;
      const repo = new PrismaUserCredentialRepository(
        prisma,
        makeCrypto(),
        makeBlindIndex(),
      );

      await repo.actualizarPerfil({ userId: 'user-1', nombre: 'Nuevo Nombre' });

      const callArgs = update.mock.calls[0][0] as {
        where: unknown;
        data: object;
      };
      expect(callArgs.where).toEqual({ id: 'user-1' });
      expect(Object.keys(callArgs.data)).toEqual(['nombre']);
    });

    it('email presente: data.email y data.emailBlindIndex derivan del MISMO email.valor, usando crypto/blindIndex inyectados (G1)', async () => {
      const update = vi.fn().mockResolvedValue({
        id: 'user-1',
        nombre: 'Jorge',
        email: 'cipher:jorge@example.com',
        esDemo: false,
      });
      const prisma = { user: { update } } as unknown as PrismaClient;
      const encryptSpy = vi.fn((v: string) => `cipher:${v}`);
      const computeSpy = vi.fn((v: string) => `bi:${v}`);
      const repo = new PrismaUserCredentialRepository(
        prisma,
        { encrypt: encryptSpy, decrypt: (v) => v },
        { compute: computeSpy },
      );
      const email = Email.crear('Jorge@Example.com').getValue();

      await repo.actualizarPerfil({ userId: 'user-1', email });

      expect(encryptSpy).toHaveBeenCalledWith('jorge@example.com');
      expect(computeSpy).toHaveBeenCalledWith('jorge@example.com');
      const callArgs = update.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(callArgs.data.email).toBe('cipher:jorge@example.com');
      expect(callArgs.data.emailBlindIndex).toBe('bi:jorge@example.com');
    });

    it('devuelve la identidad mapeada desde la fila que retorna update()', async () => {
      const update = vi.fn().mockResolvedValue({
        id: 'user-1',
        nombre: 'Jorge',
        email: 'cipher:jorge@example.com',
        esDemo: false,
      });
      const prisma = { user: { update } } as unknown as PrismaClient;
      const repo = new PrismaUserCredentialRepository(
        prisma,
        makeCrypto((v) => `plano:${v}`),
        makeBlindIndex(),
      );

      const result = await repo.actualizarPerfil({
        userId: 'user-1',
        nombre: 'Jorge',
      });

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toEqual({
        userId: 'user-1',
        nombre: 'Jorge',
        email: 'plano:cipher:jorge@example.com',
        esDemo: false,
      });
    });

    describe('P2002 disambiguation — design.md §4.2 (las 4 combinaciones pinneadas)', () => {
      function p2002(meta: unknown) {
        return new Prisma.PrismaClientKnownRequestError(
          'Unique constraint failed',
          {
            code: 'P2002',
            clientVersion: '7.8.0',
            meta: meta as never,
          },
        );
      }

      it("target: ['emailBlindIndex'] (array) ⇒ Result.fail(EmailNoDisponibleError)", async () => {
        const update = vi
          .fn()
          .mockRejectedValue(p2002({ target: ['emailBlindIndex'] }));
        const prisma = { user: { update } } as unknown as PrismaClient;
        const repo = new PrismaUserCredentialRepository(
          prisma,
          makeCrypto(),
          makeBlindIndex(),
        );

        const result = await repo.actualizarPerfil({
          userId: 'user-1',
          email: Email.crear('taken@example.com').getValue(),
        });

        expect(result.isFail()).toBe(true);
        expect(result.getError()).toBeInstanceOf(EmailNoDisponibleError);
      });

      it("target: ['googleSub'] ⇒ RETHROWS — a naive code==='P2002' catch would fail this", async () => {
        const update = vi
          .fn()
          .mockRejectedValue(p2002({ target: ['googleSub'] }));
        const prisma = { user: { update } } as unknown as PrismaClient;
        const repo = new PrismaUserCredentialRepository(
          prisma,
          makeCrypto(),
          makeBlindIndex(),
        );

        await expect(
          repo.actualizarPerfil({
            userId: 'user-1',
            email: Email.crear('x@example.com').getValue(),
          }),
        ).rejects.toThrow();
      });

      it('forma REAL del driver adapter apuntando a googleSub ⇒ RETHROWS (fail-closed, no confunde con emailBlindIndex)', async () => {
        const update = vi.fn().mockRejectedValue(
          p2002({
            modelName: 'User',
            driverAdapterError: {
              cause: {
                originalMessage:
                  'duplicate key value violates unique constraint "User_googleSub_key"',
                constraint: { fields: ['"googleSub"'] },
              },
            },
          }),
        );
        const prisma = { user: { update } } as unknown as PrismaClient;
        const repo = new PrismaUserCredentialRepository(
          prisma,
          makeCrypto(),
          makeBlindIndex(),
        );

        await expect(
          repo.actualizarPerfil({
            userId: 'user-1',
            email: Email.crear('x@example.com').getValue(),
          }),
        ).rejects.toThrow();
      });

      it('target: undefined ⇒ RETHROWS (fail-closed — unknown collision, never assumed email)', async () => {
        const update = vi.fn().mockRejectedValue(p2002(undefined));
        const prisma = { user: { update } } as unknown as PrismaClient;
        const repo = new PrismaUserCredentialRepository(
          prisma,
          makeCrypto(),
          makeBlindIndex(),
        );

        await expect(
          repo.actualizarPerfil({
            userId: 'user-1',
            email: Email.crear('x@example.com').getValue(),
          }),
        ).rejects.toThrow();
      });

      it('forma REAL del driver adapter (@prisma/adapter-pg, verificada contra Postgres real) ⇒ Result.fail(EmailNoDisponibleError)', async () => {
        const update = vi.fn().mockRejectedValue(
          p2002({
            modelName: 'User',
            driverAdapterError: {
              name: 'DriverAdapterError',
              cause: {
                originalCode: '23505',
                originalMessage:
                  'duplicate key value violates unique constraint "User_emailBlindIndex_key"',
                kind: 'UniqueConstraintViolation',
                constraint: { fields: ['"emailBlindIndex"'] },
              },
            },
          }),
        );
        const prisma = { user: { update } } as unknown as PrismaClient;
        const repo = new PrismaUserCredentialRepository(
          prisma,
          makeCrypto(),
          makeBlindIndex(),
        );

        const result = await repo.actualizarPerfil({
          userId: 'user-1',
          email: Email.crear('taken@example.com').getValue(),
        });

        expect(result.isFail()).toBe(true);
        expect(result.getError()).toBeInstanceOf(EmailNoDisponibleError);
      });

      it("target: 'User_emailBlindIndex_key' (string form) ⇒ Result.fail(EmailNoDisponibleError)", async () => {
        const update = vi
          .fn()
          .mockRejectedValue(p2002({ target: 'User_emailBlindIndex_key' }));
        const prisma = { user: { update } } as unknown as PrismaClient;
        const repo = new PrismaUserCredentialRepository(
          prisma,
          makeCrypto(),
          makeBlindIndex(),
        );

        const result = await repo.actualizarPerfil({
          userId: 'user-1',
          email: Email.crear('taken@example.com').getValue(),
        });

        expect(result.isFail()).toBe(true);
        expect(result.getError()).toBeInstanceOf(EmailNoDisponibleError);
      });
    });

    it('fila inconsistente tras el update (usuario real con email null) ⇒ LANZA (falla de infraestructura, nunca 401)', async () => {
      const update = vi.fn().mockResolvedValue({
        id: 'user-1',
        nombre: 'Jorge',
        email: null,
        esDemo: false,
      });
      const prisma = { user: { update } } as unknown as PrismaClient;
      const repo = new PrismaUserCredentialRepository(
        prisma,
        makeCrypto(),
        makeBlindIndex(),
      );

      await expect(
        repo.actualizarPerfil({ userId: 'user-1', nombre: 'Jorge' }),
      ).rejects.toThrow();
    });
  });

  describe('actualizarPassword() — PERF040-05', () => {
    it('update() con where: {id}, data: {passwordHash} y NINGUNA otra clave', async () => {
      const prisma = makePrismaUpdateMock();
      const repo = new PrismaUserCredentialRepository(
        prisma,
        makeCrypto(),
        makeBlindIndex(),
      );

      await repo.actualizarPassword('user-1', '$argon2id$nuevo-hash');

      expect(prisma.user.update as Mock).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { passwordHash: '$argon2id$nuevo-hash' },
      });
    });

    it('usa update (no updateMany) — nunca llama a updateMany', async () => {
      const updateMany = vi.fn();
      const prisma = {
        user: { update: vi.fn().mockResolvedValue({}), updateMany },
      } as unknown as PrismaClient;
      const repo = new PrismaUserCredentialRepository(
        prisma,
        makeCrypto(),
        makeBlindIndex(),
      );

      await repo.actualizarPassword('user-1', '$argon2id$nuevo-hash');

      expect(updateMany).not.toHaveBeenCalled();
      expect(prisma.user.update as Mock).toHaveBeenCalledTimes(1);
    });

    it('fila borrada (F8): update() rechaza con P2025 y actualizarPassword propaga (es ruidosa, nunca silenciosa)', async () => {
      const p2025 = new Prisma.PrismaClientKnownRequestError(
        'An operation failed because it depends on one or more records that were required but not found.',
        { code: 'P2025', clientVersion: '7.8.0' },
      );
      const update = vi.fn().mockRejectedValue(p2025);
      const prisma = { user: { update } } as unknown as PrismaClient;
      const repo = new PrismaUserCredentialRepository(
        prisma,
        makeCrypto(),
        makeBlindIndex(),
      );

      await expect(
        repo.actualizarPassword('user-1', '$argon2id$nuevo-hash'),
      ).rejects.toThrow(p2025);
    });
  });
});
