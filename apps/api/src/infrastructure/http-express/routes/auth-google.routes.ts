import type { Response, Router } from 'express';
import type {
  IIniciadorLoginExterno,
  IVerificadorIdentidadExterna,
} from '../../../application/ports/verificador-identidad-externa.port';
import type { LoginConGoogleUseCase } from '../../../application/use-cases/login-con-google.use-case';
import type { VincularGoogleUseCase } from '../../../application/use-cases/vincular-google.use-case';
import type { IpRateLimiter } from '../../http/auth/ip-rate-limiter';
import { esNavegacionDeNivelSuperior } from '../../http/auth/sec-fetch-guard';
import { getClientIp } from '../../http/auth/client-ip';
import { serializeSessionCookie } from '../../http/auth/cookie';
import { verificarLinkIntent } from '../../http/auth/link-intent';
import {
  serializeOauthCookie,
  parseOauthCookie,
  clearOauthCookie,
} from '../../http/auth/oauth-transient-cookie';
import { appLogger } from '../../logging/app-logger';

/**
 * Único valor de `error=` que el flujo produce, para TODA causa de fallo
 * (AUTH-15 — no enumeración). Nunca derivado de `motivo`, nunca un código
 * distinto por causa. También el destino de UN link-intent inválido
 * (US-041, design §1/Q1c) — NUNCA `…configuracion?google=error`, porque el
 * campo `link` no autenticó y por lo tanto no puede elegir su propio
 * destino de rechazo.
 */
const GENERIC_FAILURE_REDIRECT = '/login?error=google';

/** Destinos del modo LINK (US-041, design §4.2) — SOLO alcanzables tras un MAC verificado. */
const LINK_SUCCESS_REDIRECT = '/configuracion?google=vinculado';
const LINK_FAILURE_REDIRECT = '/configuracion?google=error';

const REJECTED_TOP_LEVEL_NAV_MESSAGE = {
  message: 'Solicitud rechazada: se requiere navegación directa.',
};

const RATE_LIMITED_MESSAGE = {
  message: 'Demasiadas solicitudes. Intenta más tarde.',
};

/** Dependencias de las dos rutas reales de Google (design §4.3, C2.3/C2.4, ampliado US-041). */
export interface AuthGoogleDeps {
  readonly iniciador: IIniciadorLoginExterno;
  readonly verificador: IVerificadorIdentidadExterna;
  readonly loginConGoogle: LoginConGoogleUseCase;
  /** US-041, VINC041-02. Solo se invoca cuando `md_oauth.link` verificó su MAC. */
  readonly vincularGoogle: VincularGoogleUseCase;
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
  /** US-041, design §3.4. Pass-through de `container.googleAuth.linkIntentKey` — verifica el MAC de `md_oauth.link`. */
  readonly linkIntentKey: Buffer;
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
    vincularGoogle,
    googleRateLimiter,
    cookieSecure,
    redirectUri,
    linkIntentKey,
  } = deps;

  // GET /api/auth/google
  router.get('/auth/google', async (req, res) => {
    try {
      appLogger.debug('Google login: initiate hit');

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
      // Debug step logging (ADR-033 slice A): mensaje estático, sin context —
      // state/nonce/codeVerifier NUNCA en claro (ADR-013); `iniciar()` los
      // garantiza siempre no vacíos acá, así que un booleano de presencia
      // sería una señal muerta (siempre true).
      appLogger.debug('Google login: state/PKCE generated');
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
      // Debug step logging (ADR-033 slice A): presence booleans only — NUNCA
      // el valor crudo de `code`/`state` (ADR-013).
      appLogger.debug('Google callback: request received', {
        hasCode: incoming.searchParams.has('code'),
        hasState: incoming.searchParams.has('state'),
      });
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

      // US-041 (design §1/Q1c, §4.2): el MAC de `link` se verifica INMEDIATAMENTE
      // después del chequeo de `state` (el binding solo tiene sentido una vez
      // que `state` ya fue validado contra el query param) y ANTES de
      // `verificador.verificar()` (una cookie forjada nunca debe gastar una
      // llamada de red a Google — mismo razonamiento de amplificación DoS que
      // ya puso el callback detrás de `googleRateLimiter`; el `code` de
      // autorización tampoco se consume en una request que iba a rechazarse
      // de todos modos).
      //
      // REJECT, NUNCA fallback a login (binding item #3, non-negotiable): un
      // `link` presente con MAC inválido rechaza el callback ENTERO con el
      // redirect genérico — nunca `…configuracion?google=error` (ese destino
      // solo es alcanzable tras un MAC verificado) y nunca continúa hacia el
      // camino de login. Caer al login use case ejecutaría la resolución
      // implícita por email — que puede escribir un `googleSub` por una
      // regla completamente distinta a la solicitada Y emite una sesión, que
      // el modo link deliberadamente no emite — eso no es "un resultado
      // levemente peor", es una escalada de privilegio de "sin sesión
      // emitida" a "sesión emitida", elegida por un byte que un atacante
      // puede voltear. Rechazar no le cuesta nada a un usuario legítimo:
      // cualquiera que quiera loguearse puede iniciar un flujo de login.
      if (
        oauthCookie.link !== undefined &&
        !verificarLinkIntent(linkIntentKey, oauthCookie.state, oauthCookie.link)
      ) {
        // Ningún userId/mac/state en el log — en este instante ninguno de
        // esos valores es confiable (design §1/Q1c, D-09).
        appLogger.warn('Google callback rechazado (link-intent inválido)', {
          path: req.path,
        });
        res.redirect(302, GENERIC_FAILURE_REDIRECT);
        return;
      }

      // Debug: engloba el intercambio de código por token + la validación
      // del id_token (aud/iss/nonce) — ambos pasos viven dentro del adapter
      // OIDC, así que la ruta solo puede observar el outcome agregado, nunca
      // el status HTTP intermedio del intercambio en sí.
      appLogger.debug(
        'Google callback: token exchange + id_token validation started',
      );
      const verificacion = await verificador.verificar({
        urlCallback: buildAbsoluteCallbackUrl(incoming, redirectUri),
        state: oauthCookie.state,
        nonce: oauthCookie.nonce,
        codeVerifier: oauthCookie.codeVerifier,
      });

      // A partir de acá, `esLink` decide únicamente entre las DOS colas
      // extraídas — todo lo de arriba (guards, state, MAC, verificación
      // OIDC) es compartido y byte-idéntico entre ambos modos (design §1/Q2a).
      const linkTarget = oauthCookie.link;

      if (verificacion.isFail()) {
        // Byte-idéntico en ambos modos (design §6.1): un id_token inválido
        // nunca llegó a resolver identidad, así que el modo (link o login)
        // es irrelevante — AUTH-15 sigue aplicando también acá.
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

      appLogger.debug('Google callback: id_token validation outcome', {
        emailVerificado: verificacion.getValue().emailVerificado,
      });

      if (linkTarget !== undefined) {
        await completarVinculacion(
          res,
          { vincularGoogle },
          linkTarget.userId,
          verificacion.getValue().sub,
          req.path,
        );
        return;
      }

      await completarLogin(
        res,
        { loginConGoogle, cookieSecure },
        verificacion.getValue(),
        req.path,
      );
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
 * completarLogin — la cola de LOGIN del callback (design §1/Q2a). Diff PURO
 * de mover, byte-idéntico al comportamiento pre-US-041 (§6.1) — ningún
 * `expect(...)` de `auth-google-callback.int-spec.ts`/`auth-google.routes.spec.ts`
 * cambia.
 */
async function completarLogin(
  res: Response,
  deps: { loginConGoogle: LoginConGoogleUseCase; cookieSecure: boolean },
  identidad: Parameters<LoginConGoogleUseCase['execute']>[0],
  path: string,
): Promise<void> {
  const resultado = await deps.loginConGoogle.execute(identidad);

  if (resultado.isFail()) {
    appLogger.warn(
      'Google callback rechazado (resolución de identidad falló)',
      {
        path,
        motivo: resultado.getError().motivo,
      },
    );
    res.redirect(302, GENERIC_FAILURE_REDIRECT);
    return;
  }

  // "identity match outcome" se fusiona acá (no un debug aparte): tras
  // pasar `resultado.isFail()` arriba, un `ok: true` en su propio evento
  // sería una señal muerta (siempre true en este punto) — el mismo dato
  // real (sesión emitida para `userId`) ya lo cubre este evento.
  const { token, userId, expiresAt } = resultado.getValue();
  appLogger.debug('Google callback: session emitted', {
    userId,
    expiresAt: expiresAt.toISOString(),
  });
  res.setHeader('Set-Cookie', [
    clearOauthCookie(deps.cookieSecure),
    serializeSessionCookie(token, expiresAt, deps.cookieSecure),
  ]);
  res.redirect(302, '/');
}

/**
 * completarVinculacion — la cola de LINK del callback (US-041, VINC041-02,
 * design §4.2). Solo se alcanza tras un MAC de `link` verificado — `userId`
 * viene del `md_oauth.link` FIRMADO (nunca de la sesión: no hay ninguna en
 * el callback), `sub` viene del `id_token` YA validado por `verificador`.
 * `completarVinculacion` NUNCA emite `md_session` (§1/Q2c) — el usuario
 * sigue logueado con su sesión same-site preexistente, que el cross-site
 * hop a Google solo retuvo, nunca borró.
 */
async function completarVinculacion(
  res: Response,
  deps: { vincularGoogle: VincularGoogleUseCase },
  userId: string,
  sub: string,
  path: string,
): Promise<void> {
  const resultado = await deps.vincularGoogle.execute({ userId, sub });

  if (resultado.isFail()) {
    appLogger.warn('Google callback (link) rechazado — vinculación falló', {
      path,
      motivo: resultado.getError().motivo,
    });
    res.redirect(302, LINK_FAILURE_REDIRECT);
    return;
  }

  appLogger.debug('Google callback: vinculación aplicada, sin nueva sesión');
  res.redirect(302, LINK_SUCCESS_REDIRECT);
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
