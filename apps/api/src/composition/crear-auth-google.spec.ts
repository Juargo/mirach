import { Prisma, type PrismaClient } from '@prisma/client';
import { crearAuthGoogle } from './crear-auth-google';
import { buildTestEnv } from '../../test/support/env.fixture';
import type { IBlindIndexService } from '../application/ports/blind-index-service.port';
import type { ICryptoService } from '../application/ports/crypto-service.port';
import type { IdentidadExterna } from '../application/ports/verificador-identidad-externa.port';
import { NoOpLogger } from '../../test/support/logger.double';
import { IniciarVinculacionGoogleUseCase } from '../application/use-cases/iniciar-vinculacion-google.use-case';
import { VincularGoogleUseCase } from '../application/use-cases/vincular-google.use-case';

const LINK_INTENT_KEY = Buffer.alloc(32, 3);

function fakePrisma(
  findUniqueImpl: (args: unknown) => unknown = () => null,
): PrismaClient {
  return {
    user: { findUnique: vi.fn(findUniqueImpl) },
    // ADR-041: el flujo sin match ahora intenta crear la cuenta — este fake
    // resuelve esa rama como carrera de creación perdida (P2002), el terminal
    // más corto que no exige stubbear el tx completo de user+catálogo.
    $transaction: vi.fn().mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    ),
  } as unknown as PrismaClient;
}

function fakeCrypto(): ICryptoService {
  return { encrypt: (v) => v, decrypt: (v) => v };
}

/**
 * crearAuthGoogle(prisma, env, crypto, blindIndex, linkIntentKey, logger) —
 * design §4.3/§3.4, D-04.
 *
 * Cubre la activación por presencia (C1.3): `undefined` cuando falta
 * cualquiera de las dos credenciales, un `GoogleAuthGraph` completo cuando
 * ambas están presentes, la construcción interna (no inyectada) de los
 * colaboradores stateless, y la reutilización de la MISMA instancia de
 * `blindIndex`/`crypto` que recibe el composition root — NUNCA una
 * re-derivación/instanciación propia (design §3.4 GUARD, 4R carry-forward).
 */
describe('crearAuthGoogle (design §4.3)', () => {
  it('retorna undefined cuando falta GOOGLE_CLIENT_ID', () => {
    const env = buildTestEnv({
      GOOGLE_CLIENT_ID: undefined,
      GOOGLE_CLIENT_SECRET: 'secret',
      GOOGLE_REDIRECT_URI: 'http://localhost:5173/api/auth/google/callback',
    });
    const blindIndex: IBlindIndexService = { compute: vi.fn() };

    const graph = crearAuthGoogle(
      fakePrisma(),
      env,
      fakeCrypto(),
      blindIndex,
      LINK_INTENT_KEY,
      new NoOpLogger(),
    );

    expect(graph).toBeUndefined();
  });

  it('retorna undefined cuando falta GOOGLE_CLIENT_SECRET', () => {
    const env = buildTestEnv({
      GOOGLE_CLIENT_ID: 'client-id',
      GOOGLE_CLIENT_SECRET: undefined,
      GOOGLE_REDIRECT_URI: 'http://localhost:5173/api/auth/google/callback',
    });
    const blindIndex: IBlindIndexService = { compute: vi.fn() };

    const graph = crearAuthGoogle(
      fakePrisma(),
      env,
      fakeCrypto(),
      blindIndex,
      LINK_INTENT_KEY,
      new NoOpLogger(),
    );

    expect(graph).toBeUndefined();
  });

  it('retorna undefined cuando faltan ambas credenciales (feature apagada por defecto)', () => {
    const env = buildTestEnv({
      GOOGLE_CLIENT_ID: undefined,
      GOOGLE_CLIENT_SECRET: undefined,
      GOOGLE_REDIRECT_URI: undefined,
    });
    const blindIndex: IBlindIndexService = { compute: vi.fn() };

    const graph = crearAuthGoogle(
      fakePrisma(),
      env,
      fakeCrypto(),
      blindIndex,
      LINK_INTENT_KEY,
      new NoOpLogger(),
    );

    expect(graph).toBeUndefined();
  });

  it('retorna un GoogleAuthGraph completo (iniciador, loginConGoogle, googleRateLimiter, iniciarVinculacion, vincularGoogle) cuando ambas credenciales están presentes', () => {
    const env = buildTestEnv({
      GOOGLE_CLIENT_ID: 'client-id',
      GOOGLE_CLIENT_SECRET: 'secret',
      GOOGLE_REDIRECT_URI: 'http://localhost:5173/api/auth/google/callback',
    });
    const blindIndex: IBlindIndexService = { compute: vi.fn() };

    const graph = crearAuthGoogle(
      fakePrisma(),
      env,
      fakeCrypto(),
      blindIndex,
      LINK_INTENT_KEY,
      new NoOpLogger(),
    );

    expect(graph).toBeDefined();
    expect(graph!.iniciador).toBeDefined();
    expect(graph!.verificador).toBeDefined();
    expect(graph!.loginConGoogle).toBeDefined();
    expect(graph!.googleRateLimiter).toBeDefined();
    expect(typeof graph!.googleRateLimiter.isBlocked).toBe('function');
    expect(graph!.iniciarVinculacion).toBeInstanceOf(
      IniciarVinculacionGoogleUseCase,
    );
    expect(graph!.vincularGoogle).toBeInstanceOf(VincularGoogleUseCase);
  });

  it('iniciador y verificador son la MISMA instancia de adapter (ISP §4.1 — dos roles, un adapter) — apply-time discovery: C1 solo exponía `iniciador`, pero la ruta de callback (C2) necesita `.verificar()` por separado', () => {
    const env = buildTestEnv({
      GOOGLE_CLIENT_ID: 'client-id',
      GOOGLE_CLIENT_SECRET: 'secret',
      GOOGLE_REDIRECT_URI: 'http://localhost:5173/api/auth/google/callback',
    });
    const blindIndex: IBlindIndexService = { compute: vi.fn() };

    const graph = crearAuthGoogle(
      fakePrisma(),
      env,
      fakeCrypto(),
      blindIndex,
      LINK_INTENT_KEY,
      new NoOpLogger(),
    );

    expect(graph!.verificador).toBe(graph!.iniciador);
  });

  it('construye sus colaboradores (reloj/tokens/sessions) INTERNAMENTE — la firma solo acepta prisma/env/crypto/blindIndex/linkIntentKey/logger, nunca los recibe como parámetro (design §4.3/§3.4, ADR-033 slice A)', () => {
    expect(crearAuthGoogle.length).toBe(6);
  });

  it('usa la MISMA instancia de blindIndex recibida — nunca una re-derivación (4R carry-forward, design §5.5)', async () => {
    const env = buildTestEnv({
      GOOGLE_CLIENT_ID: 'client-id',
      GOOGLE_CLIENT_SECRET: 'secret',
      GOOGLE_REDIRECT_URI: 'http://localhost:5173/api/auth/google/callback',
    });
    const computeSpy = vi.fn().mockReturnValue('blind-index-de-esta-instancia');
    const blindIndex: IBlindIndexService = { compute: computeSpy };

    const graph = crearAuthGoogle(
      fakePrisma(),
      env,
      fakeCrypto(),
      blindIndex,
      LINK_INTENT_KEY,
      new NoOpLogger(),
    );

    // No hay match por googleSub ni por email → intento de signup (ADR-041),
    // que este fake termina como carrera perdida. Lo que importa
    // es que buscarPorEmail (alcanzado tras el gate de emailVerificado) haya
    // invocado EXACTAMENTE esta instancia de blindIndex — si crearAuthGoogle
    // re-derivara una nueva, este spy jamás se llamaría.
    const identidad: IdentidadExterna = {
      sub: 'google-sub-inexistente',
      email: 'nadie@ejemplo.cl',
      emailVerificado: true,
    };

    await graph!.loginConGoogle.execute(identidad);

    expect(computeSpy).toHaveBeenCalledWith('nadie@ejemplo.cl');
  });

  it('GUARD (design §3.4, non-negotiable): iniciarVinculacion.execute llega hasta prisma.user.findUnique con la MISMA instancia de prisma inyectada — nunca deriva/instancia su propio crypto/blindIndex', async () => {
    const env = buildTestEnv({
      GOOGLE_CLIENT_ID: 'client-id',
      GOOGLE_CLIENT_SECRET: 'secret',
      GOOGLE_REDIRECT_URI: 'http://localhost:5173/api/auth/google/callback',
    });
    const findUnique = vi
      .fn()
      .mockResolvedValue({ id: 'user-1', passwordHash: '$argon2id$hash' });
    const prisma = { user: { findUnique } } as unknown as PrismaClient;
    const blindIndex: IBlindIndexService = { compute: vi.fn() };

    const graph = crearAuthGoogle(
      prisma,
      env,
      fakeCrypto(),
      blindIndex,
      LINK_INTENT_KEY,
      new NoOpLogger(),
    );

    // El hasher real (argon2) rechaza este hash — el flujo se detiene en la
    // verificación de password, ANTES del pre-flight 409. Llegar hasta
    // findUnique ya prueba que iniciarVinculacion recibió la MISMA instancia
    // de prisma, no una propia.
    await graph!.iniciarVinculacion.execute({
      userId: 'user-1',
      esDemo: false,
      passwordActual: 'lo-que-sea',
    });

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { id: true, passwordHash: true },
    });
  });

  it('vincularGoogle.execute llega hasta prisma.user.findUnique (buscarPorId) con la MISMA instancia de prisma inyectada', async () => {
    const env = buildTestEnv({
      GOOGLE_CLIENT_ID: 'client-id',
      GOOGLE_CLIENT_SECRET: 'secret',
      GOOGLE_REDIRECT_URI: 'http://localhost:5173/api/auth/google/callback',
    });
    const findUnique = vi.fn().mockResolvedValue(null);
    const prisma = { user: { findUnique } } as unknown as PrismaClient;
    const blindIndex: IBlindIndexService = { compute: vi.fn() };

    const graph = crearAuthGoogle(
      prisma,
      env,
      fakeCrypto(),
      blindIndex,
      LINK_INTENT_KEY,
      new NoOpLogger(),
    );

    await graph!.vincularGoogle.execute({ userId: 'user-1', sub: 'sub-1' });

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { id: true, esDemo: true, googleSub: true },
    });
  });
});
