import type { Router } from 'express';
import type {
  IIniciadorLoginExterno,
  IVerificadorIdentidadExterna,
} from '../../../application/ports/verificador-identidad-externa.port';
import type { LoginConGoogleUseCase } from '../../../application/use-cases/login-con-google.use-case';
import type { IpRateLimiter } from '../../http/auth/ip-rate-limiter';
import { esNavegacionDeNivelSuperior } from '../../http/auth/sec-fetch-guard';
import { getClientIp } from '../../http/auth/client-ip';
import { serializeSessionCookie } from '../../http/auth/cookie';
import {
  serializeOauthCookie,
  parseOauthCookie,
  clearOauthCookie,
} from '../../http/auth/oauth-transient-cookie';
import { appLogger } from '../../logging/app-logger';

/**
 * Único valor de `error=` que el flujo produce, para TODA causa de fallo
 * (AUTH-15 — no enumeración). Nunca derivado de `motivo`, nunca un código
 * distinto por causa.
 */
const GENERIC_FAILURE_REDIRECT = '/login?error=google';

const REJECTED_TOP_LEVEL_NAV_MESSAGE = {
  message: 'Solicitud rechazada: se requiere navegación directa.',
};

const RATE_LIMITED_MESSAGE = {
  message: 'Demasiadas solicitudes. Intenta más tarde.',
};

/** Dependencias de las dos rutas reales de Google (design §4.3, C2.3/C2.4). */
export interface AuthGoogleDeps {
  readonly iniciador: IIniciadorLoginExterno;
  readonly verificador: IVerificadorIdentidadExterna;
  readonly loginConGoogle: LoginConGoogleUseCase;
  readonly googleRateLimiter: IpRateLimiter;
  /** Atributo Secure de AMBAS cookies (md_oauth y md_session) — mismo derivado que cookieSecure de AuthPublicDeps. */
  readonly cookieSecure: boolean;
  /**
   * `env.GOOGLE_REDIRECT_URI` — CONFIGURADO, nunca derivado de headers de la
   * request (design §7: `x-forwarded-host` es forwardable y derivar el
   * `redirect_uri` de ahí sería un open-redirect footgun en un flujo de
   * auth). Se usa como base fija para reconstruir `urlCallback` — solo la
   * query string de la request entrante se le agrega.
   */
  readonly redirectUri: string;
}

/**
 * registrarAuthGoogle — los dos endpoints reales (Slice C2, reemplaza el
 * stub de C1 cuando `container.googleAuth !== undefined`).
 *
 * Ambos aplican `esNavegacionDeNivelSuperior` (design §3 — el callback
 * TAMBIÉN, no solo initiate: el redirect de Google es genuinamente una
 * navegación top-level `Sec-Fetch-Dest: document`, así que el guard pasa
 * gratis en el camino legítimo y bloquea un callback forzado como
 * sub-resource) y comparten el mismo `IpRateLimiter` (`google:ip:`, design
 * §6.4 — un replay del callback con un `state` ya válido es un amplificador
 * contra el endpoint de token de Google, así que consume el mismo
 * presupuesto que initiate).
 *
 * Todo throw inesperado de un colaborador (adapter/use-case/repositorio) se
 * atrapa y produce el MISMO redirect genérico que cualquier `Result.fail`
 * modelado — nunca un 500 (4R carry-forward, C2.3/C2.4): design §6 no
 * documenta una excepción explícita para el camino de fallo de
 * infraestructura, así que la postura por defecto de AUTH-15 (ninguna causa
 * de fallo es distinguible externamente) se sostiene también ahí. El nivel
 * de log SÍ distingue: `.warn` con `motivo` para las ramas `Result.fail`
 * modeladas (fallos de auth esperados), `.error` sin `motivo` para
 * excepciones no modeladas (incluye el caso benigno §5.1 — link aplicado
 * pero la emisión de sesión falló — que SIEMPRE llega acá como un throw
 * porque `LoginConGoogleUseCase.emitirSesion` no atrapa el error de
 * `sessions.crear`; no se intenta ningún rollback, el estado
 * linkeado-pero-no-logueado se autorepara en el siguiente intento vía
 * `buscarPorGoogleSub`).
 */
export function registrarAuthGoogle(
  router: Router,
  deps: AuthGoogleDeps,
): void {
  const {
    iniciador,
    verificador,
    loginConGoogle,
    googleRateLimiter,
    cookieSecure,
    redirectUri,
  } = deps;

  // GET /api/auth/google
  router.get('/auth/google', async (req, res) => {
    try {
      if (!esNavegacionDeNivelSuperior(req)) {
        appLogger.warn('Google login rechazado (no es navegación top-level)', {
          path: req.path,
        });
        res.status(403).json(REJECTED_TOP_LEVEL_NAV_MESSAGE);
        return;
      }

      const ip = getClientIp(req);
      if (googleRateLimiter.isBlocked(ip)) {
        appLogger.warn('Google login rechazado (rate-limited)', {
          path: req.path,
        });
        res.status(429).json(RATE_LIMITED_MESSAGE);
        return;
      }
      googleRateLimiter.recordFailure(ip);

      const inicio = await iniciador.iniciar();

      if (inicio.isFail()) {
        appLogger.warn(
          'Google login rechazado (fallo al iniciar autorización)',
          {
            path: req.path,
            motivo: inicio.getError().motivo,
          },
        );
        res.redirect(302, GENERIC_FAILURE_REDIRECT);
        return;
      }

      const { urlAutorizacion, state, nonce, codeVerifier } = inicio.getValue();
      res.setHeader(
        'Set-Cookie',
        serializeOauthCookie({ state, nonce, codeVerifier }, cookieSecure),
      );
      res.redirect(302, urlAutorizacion);
    } catch (err) {
      appLogger.error('Google login rechazado (fallo inesperado al iniciar)', {
        path: req.path,
        errorName: err instanceof Error ? err.name : 'UnknownError',
      });
      res.redirect(302, GENERIC_FAILURE_REDIRECT);
    }
  });

  // GET /api/auth/google/callback
  router.get('/auth/google/callback', async (req, res) => {
    // md_oauth se limpia PRIMERO, antes de cualquier otro trabajo, en TODA
    // salida (design §3) — un intento fallido nunca debe dejar un
    // code_verifier reutilizable atrás. `res.setHeader` reemplaza (no
    // acumula) el header Set-Cookie previo, así que el `success` path más
    // abajo lo vuelve a setear como ARRAY junto con md_session — nunca dos
    // llamadas independientes que se pisen entre sí.
    res.setHeader('Set-Cookie', clearOauthCookie(cookieSecure));

    try {
      if (!esNavegacionDeNivelSuperior(req)) {
        appLogger.warn(
          'Google callback rechazado (no es navegación top-level)',
          {
            path: req.path,
          },
        );
        res.status(403).json(REJECTED_TOP_LEVEL_NAV_MESSAGE);
        return;
      }

      const ip = getClientIp(req);
      if (googleRateLimiter.isBlocked(ip)) {
        appLogger.warn('Google callback rechazado (rate-limited)', {
          path: req.path,
        });
        res.status(429).json(RATE_LIMITED_MESSAGE);
        return;
      }
      googleRateLimiter.recordFailure(ip);

      const incoming = new URL(req.originalUrl, 'http://placeholder');
      const oauthCookie = parseOauthCookie(req.headers.cookie);
      const queryState = incoming.searchParams.get('state') ?? undefined;

      if (
        oauthCookie === undefined ||
        queryState === undefined ||
        queryState !== oauthCookie.state
      ) {
        appLogger.warn(
          'Google callback rechazado (state ausente o no coincide)',
          {
            path: req.path,
          },
        );
        res.redirect(302, GENERIC_FAILURE_REDIRECT);
        return;
      }

      const verificacion = await verificador.verificar({
        urlCallback: buildAbsoluteCallbackUrl(incoming, redirectUri),
        state: oauthCookie.state,
        nonce: oauthCookie.nonce,
        codeVerifier: oauthCookie.codeVerifier,
      });

      if (verificacion.isFail()) {
        appLogger.warn(
          'Google callback rechazado (verificación de identidad falló)',
          {
            path: req.path,
            motivo: verificacion.getError().motivo,
          },
        );
        res.redirect(302, GENERIC_FAILURE_REDIRECT);
        return;
      }

      const resultado = await loginConGoogle.execute(verificacion.getValue());

      if (resultado.isFail()) {
        appLogger.warn(
          'Google callback rechazado (resolución de identidad falló)',
          {
            path: req.path,
            motivo: resultado.getError().motivo,
          },
        );
        res.redirect(302, GENERIC_FAILURE_REDIRECT);
        return;
      }

      const { token, expiresAt } = resultado.getValue();
      res.setHeader('Set-Cookie', [
        clearOauthCookie(cookieSecure),
        serializeSessionCookie(token, expiresAt, cookieSecure),
      ]);
      res.redirect(302, '/');
    } catch (err) {
      // Infra fault mid-flow (4R carry-forward, C2.3/C2.4): cualquier throw
      // inesperado de un colaborador (verificador/loginConGoogle/etc.) —
      // incluye el caso benigno §5.1 (link aplicado, emisión de sesión
      // falló) — produce el MISMO redirect genérico, nunca un 500. `.error`
      // (no `.warn`) es la señal de observabilidad que distingue esta rama
      // de un fallo de auth modelado (`Result.fail`, arriba, siempre `.warn`
      // + `motivo`).
      appLogger.error(
        'Google callback rechazado (fallo inesperado / infraestructura)',
        {
          path: req.path,
          errorName: err instanceof Error ? err.name : 'UnknownError',
        },
      );
      res.redirect(302, GENERIC_FAILURE_REDIRECT);
    }
  });
}

/**
 * buildAbsoluteCallbackUrl — reconstruye la URL absoluta que
 * `verificador.verificar()` necesita (para pasarla a
 * `authorizationCodeGrant`) a partir del `redirectUri` CONFIGURADO, nunca de
 * `req`/headers (design §7). Solo la query string de la request entrante
 * (`code`/`state`/...) viaja desde `req` — el host/protocol/pathname son
 * siempre los de `env.GOOGLE_REDIRECT_URI`.
 */
function buildAbsoluteCallbackUrl(incoming: URL, redirectUri: string): string {
  const target = new URL(redirectUri);
  target.search = incoming.search;
  return target.toString();
}

/**
 * registrarAuthGoogleDeshabilitado — el stub del router `/api/auth/google*`
 * cuando el feature está apagado (`container.googleAuth === undefined`,
 * design §4.4).
 *
 * Existe porque `router.use(mw)` (el session middleware montado en
 * `protectedApi`, ver `app.ts`) corre para TODA request que llegue al
 * router, matcheada o no — un `/api/auth/google` simplemente no-montado
 * cae en `protectedApi`, encuentra `sessionMiddleware` y responde 401. Ese
 * fallthrough viola AUTH-16, que exige 404 cuando el feature está apagado.
 *
 * La solución no es un guard-clause dentro de cada handler (eso metería el
 * flag booleano en el hot path de la ruta real, Slice C2) sino montar
 * SIEMPRE un router en este path — este stub, o el real
 * (`registrarAuthGoogle`, Slice C2) — decidido UNA sola vez en `app.ts`, en
 * la composición, nunca dentro de un handler.
 */
export function registrarAuthGoogleDeshabilitado(router: Router): void {
  router.get('/auth/google', (_req, res) => {
    res.status(404).end();
  });

  router.get('/auth/google/callback', (_req, res) => {
    res.status(404).end();
  });
}
