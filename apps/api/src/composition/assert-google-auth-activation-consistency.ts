import type { Env } from '../config/env';
import type { GoogleAuthGraph } from './crear-auth-google';

/**
 * assertGoogleAuthActivationConsistency — guard de boot (C2.6a, 4R C1
 * carry-forward R4).
 *
 * C1 dejó un drift posible: el stub deshabilitado se montaba SIEMPRE en
 * `/api/auth/google*` sin importar `container.googleAuth`, así que si
 * alguien seteaba las credenciales de Google pero no había mergeado el
 * router real todavía, `GET /api/auth/capabilities` reportaba
 * `googleLoginEnabled: true` mientras las rutas reales seguían 404-ando.
 *
 * Slice C2 ata `app.ts` a la MISMA condición que capabilities lee
 * (`container.googleAuth !== undefined`), así que ese drift específico de
 * routing ya no puede ocurrir por construcción. Lo que SÍ puede seguir
 * ocurriendo es un bug de COMPOSICIÓN: `crearAuthGoogle` retornando
 * `undefined` a pesar de que `env.GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`
 * están presentes (p. ej. una condición rota en una edición futura). Esta
 * función cierra ESE caso — falla el boot fuerte y explícito ANTES de que el
 * server acepte tráfico, en vez de servir un `capabilities: true` que las
 * rutas reales contradicen en silencio.
 *
 * Llamada desde `server.ts`, después de `createContainer(env)` y antes de
 * `app.listen()` — nunca dentro de `createContainer` mismo, para mantener
 * `createContainer` una función de ensamblado pura/síncrona sin
 * responsabilidad de validación (SRP).
 */
export function assertGoogleAuthActivationConsistency(
  env: Pick<Env, 'GOOGLE_CLIENT_ID' | 'GOOGLE_CLIENT_SECRET'>,
  googleAuth: GoogleAuthGraph | undefined,
): void {
  const credencialesPresentes =
    env.GOOGLE_CLIENT_ID !== undefined &&
    env.GOOGLE_CLIENT_SECRET !== undefined;

  if (credencialesPresentes && googleAuth === undefined) {
    throw new Error(
      'Drift de activación de Google login: GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET ' +
        'están configurados pero container.googleAuth es undefined. ' +
        'GET /api/auth/capabilities reportaría googleLoginEnabled: true mientras ' +
        'GET /api/auth/google seguiría 404-ando (AUTH-16 roto). Esto es un bug de ' +
        'composición (crearAuthGoogle), no de configuración — revisar crear-auth-google.ts.',
    );
  }
}
