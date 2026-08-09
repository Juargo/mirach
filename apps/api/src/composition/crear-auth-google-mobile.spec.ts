import type { PrismaClient } from '@prisma/client';
import { crearAuthGoogleMobile } from './crear-auth-google-mobile';
import { crearAuthGoogle } from './crear-auth-google';
import { buildTestEnv } from '../../test/support/env.fixture';
import type { IBlindIndexService } from '../application/ports/blind-index-service.port';

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

    const graph = crearAuthGoogleMobile(fakePrisma(), env, blindIndex);

    expect(graph).toBeUndefined();
  });

  it('retorna un GoogleAuthMobileGraph (verificadorIdToken, loginConGoogle, googleTokenRateLimiter) cuando GOOGLE_CLIENT_ID_ANDROID está presente', () => {
    const env = buildTestEnv({
      GOOGLE_CLIENT_ID_ANDROID: VALID_ANDROID_CLIENT_ID,
    });
    const blindIndex: IBlindIndexService = { compute: vi.fn() };

    const graph = crearAuthGoogleMobile(fakePrisma(), env, blindIndex);

    expect(graph).toBeDefined();
    expect(graph!.verificadorIdToken).toBeDefined();
    expect(typeof graph!.verificadorIdToken.verificarIdToken).toBe('function');
    expect(graph!.loginConGoogle).toBeDefined();
    expect(graph!.googleTokenRateLimiter).toBeDefined();
    expect(typeof graph!.googleTokenRateLimiter.isBlocked).toBe('function');
  });

  it('nunca construye el verificador con un array de audiencias vacío (carry-over 4R A1 — env.ts ya rechaza vacío/blanco en boot, esto pin-ea la construcción)', () => {
    const env = buildTestEnv({
      GOOGLE_CLIENT_ID_ANDROID: VALID_ANDROID_CLIENT_ID,
    });
    const blindIndex: IBlindIndexService = { compute: vi.fn() };

    const graph = crearAuthGoogleMobile(fakePrisma(), env, blindIndex);

    // GoogleIdTokenVerifier guarda `audiencias` como campo privado; se
    // inspecciona en runtime porque no hay otra forma de verificar, desde
    // afuera del adapter, que el array construido tiene al menos un
    // elemento no vacío — el invariante real (env.ts rechaza vacío/blanco
    // ANTES de que este factory se ejecute) ya está cubierto en
    // env.spec.ts; esto pin-ea que el factory no introduce un segundo bug
    // (p. ej. pasar `[]` en vez de `[env.GOOGLE_CLIENT_ID_ANDROID]`).
    const audiencias = (
      graph!.verificadorIdToken as unknown as {
        audiencias: readonly string[];
      }
    ).audiencias;
    expect(audiencias.length).toBeGreaterThan(0);
    expect(audiencias.every((a) => a.trim().length > 0)).toBe(true);
  });

  it('construye sus colaboradores (rate limiter) INTERNAMENTE — la firma solo acepta prisma/env/blindIndex (design §7)', () => {
    expect(crearAuthGoogleMobile.length).toBe(3);
  });

  it('usa la MISMA instancia de blindIndex recibida — nunca una re-derivación (mismo invariante que crearAuthGoogle, design §5.5)', async () => {
    const env = buildTestEnv({
      GOOGLE_CLIENT_ID_ANDROID: VALID_ANDROID_CLIENT_ID,
    });
    const computeSpy = vi.fn().mockReturnValue('blind-index-de-esta-instancia');
    const blindIndex: IBlindIndexService = { compute: computeSpy };

    const graph = crearAuthGoogleMobile(fakePrisma(), env, blindIndex);

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
    );
    const webGraph = crearAuthGoogle(fakePrisma(), envWeb, blindIndex);

    expect(mobileGraph!.loginConGoogle).not.toBe(webGraph!.loginConGoogle);
  });
});
