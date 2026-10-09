import type { PrismaClient } from '@prisma/client';
import { createContainer } from './container';
import { ValidarSesionUseCase } from '../application/use-cases/validar-sesion.use-case';
import { generateKeyPairSync } from 'node:crypto';
import { AesGcmCryptoService } from '../infrastructure/persistence/aes-gcm-crypto.service';
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

  it('ensambla el grafo perfil (US-040, PATCH /api/perfil)', () => {
    const fakePrisma = { $disconnect: vi.fn() } as unknown as PrismaClient;

    const container = createContainer(buildTestEnv(), fakePrisma);

    expect(container.perfil).toBeDefined();
    expect(container.perfil.actualizarPerfil).toBeDefined();
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

    it('es un GoogleAuthMobileGraph definido con SOLO GOOGLE_CLIENT_ID_IOS (iOS primero, ADR-046 D8)', () => {
      const fakePrisma = { $disconnect: vi.fn() } as unknown as PrismaClient;
      const env = buildTestEnv({
        GOOGLE_CLIENT_ID_ANDROID: undefined,
        GOOGLE_CLIENT_ID_IOS: '456-def.apps.googleusercontent.com',
      });

      const container = createContainer(env, fakePrisma);

      expect(container.googleAuthMobile).toBeDefined();
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

describe('createContainer — revocación de Sign in with Apple al eliminar la cuenta (T4)', () => {
  const pem = generateKeyPairSync('ec', {
    namedCurve: 'P-256',
  }).privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  // Misma clave que `buildTestEnv` (32 bytes de 7): el token guardado se cifra con ella.
  const cifrado = new AesGcmCryptoService(Buffer.alloc(32, 7)).encrypt(
    'rt-guardado',
  );

  function prismaConToken() {
    const findUnique = vi
      .fn()
      .mockResolvedValue({ appleRefreshToken: cifrado });
    const modelo = { deleteMany: vi.fn() };
    const prisma = {
      $disconnect: vi.fn(),
      $transaction: vi.fn().mockResolvedValue([]),
      user: { findUnique, deleteMany: vi.fn() },
      session: modelo,
      transaccion: modelo,
      ingesta: modelo,
      patronClasificacion: modelo,
      categoria: modelo,
      account: modelo,
    } as unknown as PrismaClient;
    return { prisma, findUnique };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('con las cuatro variables de Apple: eliminar la cuenta revoca el token guardado en Apple', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchFn);
    const { prisma } = prismaConToken();
    const env = buildTestEnv({
      APPLE_BUNDLE_ID: 'app.mirachbudget.ios',
      APPLE_TEAM_ID: 'TEAM123456',
      APPLE_KEY_ID: 'KEY1234567',
      APPLE_PRIVATE_KEY: pem,
    });

    const result = await createContainer(env, prisma).eliminarCuenta.execute({
      userId: 'u1',
      confirmacion: 'ELIMINAR',
    });

    expect(result.isOk()).toBe(true);
    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://appleid.apple.com/auth/revoke');
    const form = new URLSearchParams(init.body as string);
    expect(form.get('token')).toBe('rt-guardado');
    expect(form.get('token_type_hint')).toBe('refresh_token');
    expect(form.get('client_id')).toBe('app.mirachbudget.ios');
  });

  it('sin credenciales de Apple: no-op — ni lee el token ni llama a Apple, y la cuenta se elimina', async () => {
    const fetchFn = vi.fn();
    vi.stubGlobal('fetch', fetchFn);
    const { prisma, findUnique } = prismaConToken();
    const env = buildTestEnv({
      APPLE_BUNDLE_ID: 'app.mirachbudget.ios',
      APPLE_TEAM_ID: undefined,
      APPLE_KEY_ID: undefined,
      APPLE_PRIVATE_KEY: undefined,
    });

    const result = await createContainer(env, prisma).eliminarCuenta.execute({
      userId: 'u1',
      confirmacion: 'ELIMINAR',
    });

    expect(result.isOk()).toBe(true);
    expect(findUnique).not.toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it('shutdown() espera al canje de Apple en curso antes de desconectar Prisma', async () => {
    let liberar!: (r: Response) => void;
    const fetchFn = vi.fn().mockReturnValue(
      new Promise<Response>((resolve) => {
        liberar = resolve;
      }),
    );
    vi.stubGlobal('fetch', fetchFn);
    const { prisma } = prismaConToken();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'u1',
      appleSub: 's',
    } as never);
    (prisma as unknown as { session: { create: unknown } }).session.create = vi
      .fn()
      .mockResolvedValue({});
    const env = buildTestEnv({
      APPLE_BUNDLE_ID: 'app.mirachbudget.ios',
      APPLE_TEAM_ID: 'TEAM123456',
      APPLE_KEY_ID: 'KEY1234567',
      APPLE_PRIVATE_KEY: pem,
    });
    const container = createContainer(env, prisma);

    await container.appleAuth?.loginConApple.execute(
      { sub: 's', email: null, emailVerificado: false, emailPrivado: false },
      null,
      'code-1',
    );
    await vi.waitFor(() => expect(fetchFn).toHaveBeenCalledOnce());

    const apagado = container.shutdown();
    await new Promise((r) => setImmediate(r));
    expect(prisma.$disconnect).not.toHaveBeenCalled();

    liberar(new Response('{"error":"invalid_grant"}', { status: 400 }));
    await apagado;

    expect(prisma.$disconnect).toHaveBeenCalledOnce();
  });
});
