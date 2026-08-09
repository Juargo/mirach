import { assertGoogleAuthMobileActivationConsistency } from './assert-google-auth-mobile-activation-consistency';
import { buildTestEnv } from '../../test/support/env.fixture';
import type { GoogleAuthMobileGraph } from './crear-auth-google-mobile';

const VALID_ANDROID_CLIENT_ID = '123-abc.apps.googleusercontent.com';

/**
 * assertGoogleAuthMobileActivationConsistency — sibling de
 * `assertGoogleAuthActivationConsistency` (design §7). Deliberadamente casi
 * idéntica a esa función — segunda ocurrencia, no el tercer strike que
 * justificaría extraer un helper compartido (yagni, design §7).
 *
 * Cierra el mismo tipo de drift que su sibling web, pero para el gate mobile:
 * un bug de COMPOSICIÓN donde `crearAuthGoogleMobile` retorna `undefined` a
 * pesar de que `GOOGLE_CLIENT_ID_ANDROID` está configurado.
 */
describe('assertGoogleAuthMobileActivationConsistency (design §7)', () => {
  function fakeGraph(): GoogleAuthMobileGraph {
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
      assertGoogleAuthMobileActivationConsistency(env, fakeGraph()),
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
