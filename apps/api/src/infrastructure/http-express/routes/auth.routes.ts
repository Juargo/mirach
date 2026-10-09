import type { Router } from 'express';
import { LoginUseCase } from '../../../application/use-cases/login.use-case';
import { LogoutUseCase } from '../../../application/use-cases/logout.use-case';
import { ObtenerIdentidadUseCase } from '../../../application/use-cases/obtener-identidad.use-case';
import { LoginRateLimiter } from '../../http/auth/login-rate-limiter';
import { getClientIp } from '../../http/auth/client-ip';
import { extractToken } from '../../http/auth/extraer-token';
import {
  serializeSessionCookie,
  clearSessionCookie,
} from '../../http/auth/cookie';
import { appLogger } from '../../logging/app-logger';
import { CREDENCIALES_INVALIDAS, SESION_INVALIDA } from '../auth-error-codes';

/** Dependencias de las rutas session-public (login/logout). */
export interface AuthPublicDeps {
  readonly login: LoginUseCase;
  readonly logout: LogoutUseCase;
  readonly loginRateLimiter: LoginRateLimiter;
  /** Atributo Secure de la cookie de sesión (ADR-029) — derivado una única vez en app.ts a partir de `env`. */
  readonly cookieSecure: boolean;
}

/**
 * registrarAuthPublic — port de los endpoints session-public del AuthController
 * (ADR-028): login/logout exigen `x-api-key` (aplicado globalmente en /api)
 * pero NO una sesión ya validada. Por eso montan en un router SIN el session
 * middleware — el equivalente Express de `@PublicSession()`.
 */
export function registrarAuthPublic(
  router: Router,
  deps: AuthPublicDeps,
): void {
  const { login, logout, loginRateLimiter, cookieSecure } = deps;

  // POST /api/auth/login
  router.post('/auth/login', async (req, res, next) => {
    try {
      const body = req.body as
        { email?: unknown; password?: unknown } | undefined;
      const email = typeof body?.email === 'string' ? body.email : '';
      const password = typeof body?.password === 'string' ? body.password : '';
      const ip = getClientIp(req);

      if (loginRateLimiter.isBlocked(ip, email)) {
        // Scrubbed: path only — NUNCA el email/password.
        appLogger.warn('Login rechazado (rate-limited)', { path: req.path });
        res
          .status(429)
          .json({ message: 'Demasiados intentos. Espera unos minutos.' });
        return;
      }

      // Registra el intento OPTIMISTAMENTE, antes de await — evita el race
      // check-then-act (N requests concurrentes pasarían isBlocked antes de que
      // ninguna registre el fallo). El login exitoso lo limpia con reset().
      loginRateLimiter.recordFailure(ip, email);

      const result = await login.execute({ emailRaw: email, password });

      if (result.isFail()) {
        appLogger.warn('Login rechazado (credenciales inválidas)', {
          path: req.path,
        });
        res.status(401).json({
          message: result.getError().message,
          code: CREDENCIALES_INVALIDAS,
        });
        return;
      }

      loginRateLimiter.reset(ip, email);
      const { token, userId, expiresAt } = result.getValue();
      res.setHeader(
        'Set-Cookie',
        serializeSessionCookie(token, expiresAt, cookieSecure),
      );
      res
        .status(200)
        .json({ token, userId, expiresAt: expiresAt.toISOString() });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/auth/logout
  router.post('/auth/logout', async (req, res, next) => {
    try {
      const token = extractToken(req);

      try {
        await logout.execute({ token });
      } catch (err) {
        // Logout robusto: nunca relanza — la cookie se limpia igual client-side.
        appLogger.error('Error inesperado durante el logout', {
          errorName: err instanceof Error ? err.name : 'UnknownError',
        });
      }

      res.setHeader('Set-Cookie', clearSessionCookie(cookieSecure));
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });
}

/**
 * registrarAuthMe — GET /api/auth/me (AUTH-09). SIN marcador: la protege el
 * session middleware como cualquier endpoint de datos, así que monta en el
 * router protegido. `userId` viene de `req.userId`.
 */
export function registrarAuthMe(
  router: Router,
  obtenerIdentidad: ObtenerIdentidadUseCase,
): void {
  router.get('/auth/me', async (req, res, next) => {
    try {
      const result = await obtenerIdentidad.execute({ userId: req.userId! });

      if (result.isFail()) {
        res.status(401).json({
          message: result.getError().message,
          code: SESION_INVALIDA,
        });
        return;
      }

      const identidad = result.getValue();
      res.status(200).json({
        userId: identidad.userId,
        nombre: identidad.nombre,
        email: identidad.email,
        googleVinculado: identidad.googleVinculado,
      });
    } catch (err) {
      next(err);
    }
  });
}
