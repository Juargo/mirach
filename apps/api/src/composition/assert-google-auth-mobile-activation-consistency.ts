import type { Env } from '../config/env';
import type { GoogleAuthMobileGraph } from './crear-auth-google-mobile';

/**
 * assertGoogleAuthMobileActivationConsistency — guard de boot (design §7),
 * sibling de `assertGoogleAuthActivationConsistency`.
 *
 * Deliberadamente casi idéntica a su sibling web: es la SEGUNDA ocurrencia
 * de esta forma (env presente ⇒ grafo definido, o falla el boot), no el
 * tercer strike que justificaría extraerla en un helper genérico (yagni —
 * design §7 documenta esto explícitamente, no es un descuido).
 *
 * Cierra el mismo tipo de bug de COMPOSICIÓN que su sibling, pero para el
 * gate mobile: `crearAuthGoogleMobile` retornando `undefined` a pesar de que
 * `env.GOOGLE_CLIENT_ID_ANDROID` está presente (p. ej. una condición rota en
 * una edición futura). Falla el boot fuerte y explícito ANTES de que el
 * server acepte tráfico.
 *
 * Llamada desde `server.ts`, después de `createContainer(env)` y antes de
 * `app.listen()`, junto a la assertion web — nunca dentro de
 * `createContainer` mismo (SRP, mismo razonamiento que el sibling).
 */
export function assertGoogleAuthMobileActivationConsistency(
  env: Pick<Env, 'GOOGLE_CLIENT_ID_ANDROID'>,
  googleAuthMobile: GoogleAuthMobileGraph | undefined,
): void {
  const clientIdAndroidPresente = env.GOOGLE_CLIENT_ID_ANDROID !== undefined;

  if (clientIdAndroidPresente && googleAuthMobile === undefined) {
    throw new Error(
      'Drift de activación de Google login mobile: GOOGLE_CLIENT_ID_ANDROID ' +
        'está configurado pero container.googleAuthMobile es undefined. ' +
        'GET /api/auth/capabilities reportaría googleLoginMobileEnabled: true ' +
        'mientras POST /api/auth/google/token seguiría 404-ando (AUTH-22 roto). ' +
        'Esto es un bug de composición (crearAuthGoogleMobile), no de ' +
        'configuración — revisar crear-auth-google-mobile.ts.',
    );
  }
}
