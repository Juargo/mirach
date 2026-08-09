import {
  assertGoogleAuthActivationConsistency,
  assertGoogleAuthMobileActivationConsistency,
} from './assert-google-auth-activation-consistency';
import { buildTestEnv } from '../../test/support/env.fixture';
import type { GoogleAuthGraph } from './crear-auth-google';
import type { GoogleAuthMobileGraph } from './crear-auth-google-mobile';

const VALID_ANDROID_CLIENT_ID = '123-abc.apps.googleusercontent.com';

/**
 * assertGoogleAuthActivationConsistency — C2.6a, 4R C1 carry-forward.
 *
 * Cierra el drift documentado en C1 (R4): con SOLO C1 mergeado,
 * `GET /api/auth/capabilities` podía reportar `googleLoginEnabled: true`
 * mientras `GET /api/auth/google` seguía 404-ando (el stub deshabilitado se
 * montaba SIEMPRE, sin importar `container.googleAuth`). Slice C2 ata la
 * rama real de `app.ts` a la MISMA condición que capabilities lee
 * (`container.googleAuth !== undefined`), así que el drift solo puede
 * reaparecer si `crearAuthGoogle` retorna `undefined` a pesar de que las
 * credenciales están presentes en `env` (un bug de composición, no de
 * routing) — exactamente lo que esta guard detecta, en boot, antes de que
 * el server empiece a aceptar tráfico.
 */
describe('assertGoogleAuthActivationConsistency (C2.6a)', () => {
  function fakeGraph(): GoogleAuthGraph {
    return {
      iniciador: { iniciar: vi.fn() },
      verificador: { verificar: vi.fn() },
      loginConGoogle: {} as never,
      googleRateLimiter: {} as never,
    };
  }

  it('no lanza cuando ninguna credencial está presente y googleAuth es undefined (feature apagada, consistente)', () => {
    const env = buildTestEnv({
      GOOGLE_CLIENT_ID: undefined,
      GOOGLE_CLIENT_SECRET: undefined,
    });

    expect(() =>
      assertGoogleAuthActivationConsistency(env, undefined),
    ).not.toThrow();
  });

  it('no lanza cuando ambas credenciales están presentes y googleAuth está definido (feature prendida, consistente)', () => {
    const env = buildTestEnv({
      GOOGLE_CLIENT_ID: 'client-id',
      GOOGLE_CLIENT_SECRET: 'secret',
      GOOGLE_REDIRECT_URI: 'http://localhost:5173/api/auth/google/callback',
    });

    expect(() =>
      assertGoogleAuthActivationConsistency(env, fakeGraph()),
    ).not.toThrow();
  });

  it('LANZA cuando ambas credenciales están presentes pero googleAuth es undefined (el drift exacto de C1 — capabilities diría true, rutas 404)', () => {
    const env = buildTestEnv({
      GOOGLE_CLIENT_ID: 'client-id',
      GOOGLE_CLIENT_SECRET: 'secret',
      GOOGLE_REDIRECT_URI: 'http://localhost:5173/api/auth/google/callback',
    });

    expect(() => assertGoogleAuthActivationConsistency(env, undefined)).toThrow(
      /GOOGLE_CLIENT_ID.*GOOGLE_CLIENT_SECRET.*googleAuth/s,
    );
  });
});

/**
 * assertGoogleAuthMobileActivationConsistency — sibling mobile del guard web
 * (design §7, AUTH-22). Deliberadamente casi idéntica — segunda ocurrencia,
 * no el tercer strike que justificaría extraer un helper compartido (yagni).
 */
describe('assertGoogleAuthMobileActivationConsistency (design §7)', () => {
  function fakeMobileGraph(): GoogleAuthMobileGraph {
    return {
      verificadorIdToken: { verificarIdToken: vi.fn() },
      loginConGoogle: {} as never,
      googleTokenRateLimiter: {} as never,
    };
  }

  it('no lanza cuando GOOGLE_CLIENT_ID_ANDROID está ausente y googleAuthMobile es undefined (feature apagada, consistente)', () => {
    const env = buildTestEnv({ GOOGLE_CLIENT_ID_ANDROID: undefined });

    expect(() =>
      assertGoogleAuthMobileActivationConsistency(env, undefined),
    ).not.toThrow();
  });

  it('no lanza cuando GOOGLE_CLIENT_ID_ANDROID está presente y googleAuthMobile está definido (feature prendida, consistente)', () => {
    const env = buildTestEnv({
      GOOGLE_CLIENT_ID_ANDROID: VALID_ANDROID_CLIENT_ID,
    });

    expect(() =>
      assertGoogleAuthMobileActivationConsistency(env, fakeMobileGraph()),
    ).not.toThrow();
  });

  it('LANZA cuando GOOGLE_CLIENT_ID_ANDROID está presente pero googleAuthMobile es undefined (bug de composición)', () => {
    const env = buildTestEnv({
      GOOGLE_CLIENT_ID_ANDROID: VALID_ANDROID_CLIENT_ID,
    });

    expect(() =>
      assertGoogleAuthMobileActivationConsistency(env, undefined),
    ).toThrow(/GOOGLE_CLIENT_ID_ANDROID.*googleAuthMobile/s);
  });
});
