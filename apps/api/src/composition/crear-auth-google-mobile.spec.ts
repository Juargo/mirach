import type { PrismaClient } from '@prisma/client';
import { crearAuthGoogleMobile } from './crear-auth-google-mobile';
import { crearAuthGoogle } from './crear-auth-google';
import { buildTestEnv } from '../../test/support/env.fixture';
import type { IBlindIndexService } from '../application/ports/blind-index-service.port';
import { NoOpLogger } from '../../test/support/logger.double';

function fakePrisma(
  findUniqueImpl: (args: unknown) => unknown = () => null,
): PrismaClient {
  return {
    user: { findUnique: vi.fn(findUniqueImpl) },
  } as unknown as PrismaClient;
}

const VALID_ANDROID_CLIENT_ID = '123-abc.apps.googleusercontent.com';

/**
 * crearAuthGoogleMobile(prisma, env, blindIndex) — design §7.
 *
 * Mirror de `crearAuthGoogle`: activación por presencia de
 * `GOOGLE_CLIENT_ID_ANDROID` (AUTH-22), gate TOTALMENTE independiente del par
 * web, misma disciplina de reutilizar (nunca re-derivar) la instancia de
 * `blindIndex`, y una SEGUNDA instancia independiente de
 * `LoginConGoogleUseCase` (no compartida con `crearAuthGoogle`'s — los dos
 * gates son independientes, compartir acoplaría lo que debe poder apagarse
 * por separado).
 */
describe('crearAuthGoogleMobile (design §7)', () => {
  it('retorna undefined cuando GOOGLE_CLIENT_ID_ANDROID está ausente (feature apagada por defecto)', () => {
    const env = buildTestEnv({ GOOGLE_CLIENT_ID_ANDROID: undefined });
    const blindIndex: IBlindIndexService = { compute: vi.fn() };

    const graph = crearAuthGoogleMobile(
      fakePrisma(),
      env,
      blindIndex,
      new NoOpLogger(),
    );

    expect(graph).toBeUndefined();
  });

  it('retorna un GoogleAuthMobileGraph (verificadorIdToken, loginConGoogle, googleTokenRateLimiter) cuando GOOGLE_CLIENT_ID_ANDROID está presente', () => {
    const env = buildTestEnv({
      GOOGLE_CLIENT_ID_ANDROID: VALID_ANDROID_CLIENT_ID,
    });
    const blindIndex: IBlindIndexService = { compute: vi.fn() };

    const graph = crearAuthGoogleMobile(
      fakePrisma(),
      env,
      blindIndex,
      new NoOpLogger(),
    );

    expect(graph).toBeDefined();
    expect(graph!.verificadorIdToken).toBeDefined();
    expect(typeof graph!.verificadorIdToken.verificarIdToken).toBe('function');
    expect(graph!.loginConGoogle).toBeDefined();
    expect(graph!.googleTokenRateLimiter).toBeDefined();
    expect(typeof graph!.googleTokenRateLimiter.isBlocked).toBe('function');
  });

  it('usa la MISMA instancia de blindIndex recibida — nunca una re-derivación (mismo invariante que crearAuthGoogle, design §5.5)', async () => {
    const env = buildTestEnv({
      GOOGLE_CLIENT_ID_ANDROID: VALID_ANDROID_CLIENT_ID,
    });
    const computeSpy = vi.fn().mockReturnValue('blind-index-de-esta-instancia');
    const blindIndex: IBlindIndexService = { compute: computeSpy };

    const graph = crearAuthGoogleMobile(
      fakePrisma(),
      env,
      blindIndex,
      new NoOpLogger(),
    );

    await graph!.loginConGoogle.execute({
      sub: 'google-sub-inexistente',
      email: 'nadie@ejemplo.cl',
      emailVerificado: true,
    });

    expect(computeSpy).toHaveBeenCalledWith('nadie@ejemplo.cl');
  });

  it('construye una SEGUNDA instancia de LoginConGoogleUseCase, independiente de crearAuthGoogle (los dos gates no comparten estado)', () => {
    const envMobile = buildTestEnv({
      GOOGLE_CLIENT_ID_ANDROID: VALID_ANDROID_CLIENT_ID,
    });
    const envWeb = buildTestEnv({
      GOOGLE_CLIENT_ID: 'client-id-web',
      GOOGLE_CLIENT_SECRET: 'client-secret-web',
      GOOGLE_REDIRECT_URI: 'http://localhost:5173/api/auth/google/callback',
    });
    const blindIndex: IBlindIndexService = { compute: vi.fn() };

    const mobileGraph = crearAuthGoogleMobile(
      fakePrisma(),
      envMobile,
      blindIndex,
      new NoOpLogger(),
    );
    const webGraph = crearAuthGoogle(
      fakePrisma(),
      envWeb,
      blindIndex,
      new NoOpLogger(),
    );

    expect(mobileGraph!.loginConGoogle).not.toBe(webGraph!.loginConGoogle);
  });
});
