import type { PrismaClient } from '@prisma/client';
import { createContainer } from './container';
import { ValidarSesionUseCase } from '../application/use-cases/validar-sesion.use-case';
import { buildTestEnv } from '../../test/support/env.fixture';

/**
 * createContainer — composition root real (ADR-028/029). Ensambla el grafo con
 * `new` y es dueño del ciclo de vida de Prisma que antes gestionaba Nest.
 *
 * ADR-029: `env` es el primer parámetro (`createContainer(env, prisma =
 * createPrismaClient(env))`) — el `prisma` explícito en los tests evita
 * conectar a una DB real; `env` viene de `buildTestEnv()` (fixture, ver
 * test/support/env.fixture.ts).
 */
describe('createContainer', () => {
  it('shutdown() cierra la conexión Prisma', async () => {
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const fakePrisma = { $disconnect: disconnect } as unknown as PrismaClient;

    const container = createContainer(buildTestEnv(), fakePrisma);
    await container.shutdown();

    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('ensambla ValidarSesionUseCase (usado por el session middleware)', () => {
    const fakePrisma = { $disconnect: vi.fn() } as unknown as PrismaClient;

    const container = createContainer(buildTestEnv(), fakePrisma);

    expect(container.validarSesion).toBeInstanceOf(ValidarSesionUseCase);
  });

  describe('googleAuth (design §4.3/§4.4 — seam de activación)', () => {
    it('es undefined cuando GOOGLE_CLIENT_ID/SECRET están ausentes (feature apagada por defecto)', () => {
      const fakePrisma = { $disconnect: vi.fn() } as unknown as PrismaClient;
      const env = buildTestEnv({
        GOOGLE_CLIENT_ID: undefined,
        GOOGLE_CLIENT_SECRET: undefined,
        GOOGLE_REDIRECT_URI: undefined,
      });

      const container = createContainer(env, fakePrisma);

      expect(container.googleAuth).toBeUndefined();
    });

    it('es un GoogleAuthGraph definido cuando ambas credenciales están presentes', () => {
      const fakePrisma = { $disconnect: vi.fn() } as unknown as PrismaClient;
      const env = buildTestEnv({
        GOOGLE_CLIENT_ID: 'client-id',
        GOOGLE_CLIENT_SECRET: 'secret',
        GOOGLE_REDIRECT_URI: 'http://localhost:5173/api/auth/google/callback',
      });

      const container = createContainer(env, fakePrisma);

      expect(container.googleAuth).toBeDefined();
      expect(container.googleAuth!.loginConGoogle).toBeDefined();
    });
  });

  describe('googleAuthMobile (design §7 — seam de activación independiente, AUTH-22)', () => {
    it('es undefined cuando GOOGLE_CLIENT_ID_ANDROID está ausente (feature mobile apagada por defecto)', () => {
      const fakePrisma = { $disconnect: vi.fn() } as unknown as PrismaClient;
      const env = buildTestEnv({ GOOGLE_CLIENT_ID_ANDROID: undefined });

      const container = createContainer(env, fakePrisma);

      expect(container.googleAuthMobile).toBeUndefined();
    });

    it('es un GoogleAuthMobileGraph definido cuando GOOGLE_CLIENT_ID_ANDROID está presente', () => {
      const fakePrisma = { $disconnect: vi.fn() } as unknown as PrismaClient;
      const env = buildTestEnv({
        GOOGLE_CLIENT_ID_ANDROID: '123-abc.apps.googleusercontent.com',
      });

      const container = createContainer(env, fakePrisma);

      expect(container.googleAuthMobile).toBeDefined();
      expect(container.googleAuthMobile!.loginConGoogle).toBeDefined();
    });

    it('es independiente de googleAuth (web) — ambos gates pueden estar en cualquier combinación', () => {
      const fakePrisma = { $disconnect: vi.fn() } as unknown as PrismaClient;
      const env = buildTestEnv({
        GOOGLE_CLIENT_ID: undefined,
        GOOGLE_CLIENT_SECRET: undefined,
        GOOGLE_REDIRECT_URI: undefined,
        GOOGLE_CLIENT_ID_ANDROID: '123-abc.apps.googleusercontent.com',
      });

      const container = createContainer(env, fakePrisma);

      expect(container.googleAuth).toBeUndefined();
      expect(container.googleAuthMobile).toBeDefined();
    });
  });
});
