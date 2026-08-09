import type { Router } from 'express';
import type { IVerificadorIdTokenExterno } from '../../../application/ports/verificador-identidad-externa.port';
import type { LoginConGoogleUseCase } from '../../../application/use-cases/login-con-google.use-case';
import type { IpRateLimiter } from '../../http/auth/ip-rate-limiter';
import { getClientIp } from '../../http/auth/client-ip';
import { appLogger } from '../../logging/app-logger';
import { CredencialesInvalidasError } from '../../../domain/errors/credenciales-invalidas.error';

/**
 * Cuerpo genérico 401 — byte-idéntico al de `/auth/login` (AUTH-21). NO
 * derivado de `LoginConGoogleFallidoError.message` (esa clase produce "No
 * pudimos iniciar sesión con Google.", un texto distinto reservado para el
 * logging/redirect del flujo web) ni de `VerificacionIdentidadFallidaError.
 * message`. Derivado de `CredencialesInvalidasError` — la misma fuente de
 * verdad que usa `/auth/login` — para que el body se mantenga byte-idéntico
 * por construcción y una futura edición de ese mensaje no pueda hacer drift
 * entre ambos endpoints sin romper un test. La paridad exacta con
 * `/auth/login` es el requisito (AUTH-21/AUTH-02, no enumeración) — el mismo
 * cuerpo para TODA causa de fallo, incluido un throw inesperado.
 */
const GENERIC_401_BODY = { message: new CredencialesInvalidasError().message };

const RATE_LIMITED_BODY = {
  message: 'Demasiadas solicitudes. Intenta más tarde.',
};

/** Dependencias de `POST /api/auth/google/token` — mismo shape que `GoogleAuthMobileGraph` (composition, design §7). */
export interface AuthGoogleTokenDeps {
  readonly verificadorIdToken: IVerificadorIdTokenExterno;
  readonly loginConGoogle: LoginConGoogleUseCase;
  readonly googleTokenRateLimiter: IpRateLimiter;
}

/**
 * registrarAuthGoogleToken — `POST /api/auth/google/token` (ADR-035 M1,
 * design §6). Verifica un `id_token` nativo obtenido en el dispositivo y, si
 * es válido, resuelve la identidad por el MISMO camino find-only de
 * `LoginConGoogleUseCase` (AUTH-20) — cero cambios respecto al flujo web.
 *
 * Cuerpo de la request manejado igual que `/auth/login`
 * (`typeof body?.idToken === 'string' ? body.idToken : ''`, design §6.2):
 * NUNCA 400 — toda forma inválida toma el mismo camino 401 genérico
 * (AUTH-21, una salida externamente distinguible menos). El caso `''`
 * corta en el adapter sin llamada de red (design §5.2).
 *
 * Sin `Set-Cookie` (mobile es Bearer + SecureStore, MOB-02). Sin guard
 * Sec-Fetch (design §6.3 — decisión explícita, no copiada: es un POST con
 * body JSON desde un cliente nativo sin headers `Sec-Fetch-*`, el guard
 * fallaría abierto).
 *
 * Todo throw inesperado de un colaborador (verificador/loginConGoogle) se
 * atrapa acá mismo y produce el MISMO 401 genérico — nunca un 500 vía
 * `errorMiddleware` (design §6.2, "unexpected throw" está en la lista de
 * causas indistinguibles de AUTH-21). El nivel de log SÍ distingue:
 * `.warn` + `motivo` para fallos modelados (`Result.fail`), `.error` +
 * `errorName` para excepciones no modeladas — nunca el `idToken`, el email,
 * `googleSub`, ni el token de sesión (ADR-033/AUTH-18, design §6.5).
 */
export function registrarAuthGoogleToken(
  router: Router,
  deps: AuthGoogleTokenDeps,
): void {
  const { verificadorIdToken, loginConGoogle, googleTokenRateLimiter } = deps;

  router.post('/auth/google/token', async (req, res) => {
    try {
      const ip = getClientIp(req);
      if (googleTokenRateLimiter.isBlocked(ip)) {
        appLogger.warn('Google token rechazado (rate-limited)', {
          path: req.path,
        });
        res.status(429).json(RATE_LIMITED_BODY);
        return;
      }
      googleTokenRateLimiter.recordFailure(ip);

      const body = req.body as { idToken?: unknown } | undefined;
      const idToken = typeof body?.idToken === 'string' ? body.idToken : '';

      const verificacion = await verificadorIdToken.verificarIdToken(idToken);

      if (verificacion.isFail()) {
        appLogger.warn(
          'Google token rechazado (verificación de id_token falló)',
          {
            path: req.path,
            motivo: verificacion.getError().motivo,
          },
        );
        res.status(401).json(GENERIC_401_BODY);
        return;
      }

      const resultado = await loginConGoogle.execute(verificacion.getValue());

      if (resultado.isFail()) {
        appLogger.warn(
          'Google token rechazado (resolución de identidad falló)',
          {
            path: req.path,
            motivo: resultado.getError().motivo,
          },
        );
        res.status(401).json(GENERIC_401_BODY);
        return;
      }

      // Optimistic recordFailure() arriba + reset() acá en éxito (mismo
      // patrón que `/auth/login`, design §6.4): el presupuesto 30/15min solo
      // lo consumen los intentos FALLIDOS — un actor con muchos logins
      // exitosos legítimos (CGNAT) nunca se topa con el límite.
      googleTokenRateLimiter.reset(ip);

      const { token, userId, expiresAt } = resultado.getValue();
      res
        .status(200)
        .json({ token, userId, expiresAt: expiresAt.toISOString() });
    } catch (err) {
      appLogger.error('Google token rechazado (fallo inesperado)', {
        path: req.path,
        errorName: err instanceof Error ? err.name : 'UnknownError',
      });
      res.status(401).json(GENERIC_401_BODY);
    }
  });
}

/**
 * registrarAuthGoogleTokenDeshabilitado — el stub cuando
 * `container.googleAuthMobile === undefined` (design §6.1, AUTH-22).
 *
 * Genuinamente requerido — el stub disabled existente
 * (`registrarAuthGoogleDeshabilitado`) solo registra los dos GET del flujo
 * web; sin este, un `POST /auth/google/token` no-montado caería en
 * `protectedApi` de abajo, cuyo `sessionMiddleware` sin path corre para TODA
 * request que llegue al router y respondería 401, no el 404 que exige la
 * paridad de activación (mismo 404-vs-401 trap que AUTH-16 documenta para
 * el flujo web).
 */
export function registrarAuthGoogleTokenDeshabilitado(router: Router): void {
  router.post('/auth/google/token', (_req, res) => {
    res.status(404).end();
  });
}
