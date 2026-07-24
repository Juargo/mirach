import type { Router } from 'express';
import { LoginUseCase } from '../../../application/use-cases/login.use-case';
import { LogoutUseCase } from '../../../application/use-cases/logout.use-case';
import { ObtenerIdentidadUseCase } from '../../../application/use-cases/obtener-identidad.use-case';
import { CrearDemoUseCase } from '../../../application/use-cases/crear-demo.use-case';
import { ValidarSesionUseCase } from '../../../application/use-cases/validar-sesion.use-case';
import { LoginRateLimiter } from '../../http/auth/login-rate-limiter';
import { DemoRateLimiter } from '../../http/auth/demo-rate-limiter';
import { DemoCleanupService } from '../../http/auth/demo-cleanup.service';
import { getClientIp } from '../../http/auth/client-ip';
import { extractToken } from '../../http/auth/extraer-token';
import { serializeSessionCookie, clearSessionCookie } from '../../http/auth/cookie';
import { esNavegacionDeNivelSuperior } from '../../http/auth/sec-fetch-guard';

/** Dependencias de las rutas session-public (login/logout/demo). */
export interface AuthPublicDeps {
  readonly login: LoginUseCase;
  readonly logout: LogoutUseCase;
  readonly crearDemo: CrearDemoUseCase;
  readonly demoCleanup: DemoCleanupService;
  readonly validarSesion: ValidarSesionUseCase;
  readonly loginRateLimiter: LoginRateLimiter;
  readonly demoRateLimiter: DemoRateLimiter;
}

/**
 * registrarAuthPublic — port de los endpoints session-public del AuthController
 * (ADR-028): login/logout/demo exigen `x-api-key` (aplicado globalmente en /api)
 * pero NO una sesión ya validada. Por eso montan en un router SIN el session
 * middleware — el equivalente Express de `@PublicSession()`.
 */
export function registrarAuthPublic(router: Router, deps: AuthPublicDeps): void {
  const { login, logout, crearDemo, demoCleanup, validarSesion, loginRateLimiter, demoRateLimiter } =
    deps;

  // POST /api/auth/login
  router.post('/auth/login', async (req, res, next) => {
    try {
      const body = req.body as { email?: unknown; password?: unknown } | undefined;
      const email = typeof body?.email === 'string' ? body.email : '';
      const password = typeof body?.password === 'string' ? body.password : '';
      const ip = getClientIp(req);

      if (loginRateLimiter.isBlocked(ip, email)) {
        // Scrubbed: path only — NUNCA el email/password.
        console.warn(`Login rechazado (rate-limited) — path=${req.path}`);
        res.status(429).json({ message: 'Demasiados intentos. Espera unos minutos.' });
        return;
      }

      // Registra el intento OPTIMISTAMENTE, antes de await — evita el race
      // check-then-act (N requests concurrentes pasarían isBlocked antes de que
      // ninguna registre el fallo). El login exitoso lo limpia con reset().
      loginRateLimiter.recordFailure(ip, email);

      const result = await login.execute({ emailRaw: email, password });

      if (result.isFail()) {
        console.warn(`Login rechazado (credenciales inválidas) — path=${req.path}`);
        res.status(401).json({ message: result.getError().message });
        return;
      }

      loginRateLimiter.reset(ip, email);
      const { token, userId, expiresAt } = result.getValue();
      res.setHeader('Set-Cookie', serializeSessionCookie(token, expiresAt));
      res.status(200).json({ token, userId, expiresAt: expiresAt.toISOString() });
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
        console.error(
          'Error inesperado durante el logout',
          err instanceof Error ? err.stack : String(err),
        );
      }

      res.setHeader('Set-Cookie', clearSessionCookie());
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  // GET /api/auth/demo
  router.get('/auth/demo', async (req, res, next) => {
    try {
      if (!esNavegacionDeNivelSuperior(req)) {
        console.warn(`Demo rechazado (no es navegación top-level) — path=${req.path}`);
        res.status(403).json({ message: 'Solicitud rechazada: se requiere navegación directa.' });
        return;
      }

      const tokenExistente = extractToken(req);
      if (tokenExistente !== undefined) {
        const validado = await validarSesion.execute({ token: tokenExistente });
        if (validado.isOk()) {
          // Sesión válida existente (real o demo): redirige sin pisar la cookie.
          res.redirect(302, '/');
          return;
        }
      }

      const ip = getClientIp(req);
      if (demoRateLimiter.isBlocked(ip)) {
        console.warn(`Demo rechazado (rate-limited) — path=${req.path}`);
        res.status(429).json({ message: 'Demasiadas solicitudes de demo. Intenta más tarde.' });
        return;
      }
      demoRateLimiter.recordFailure(ip);

      // Isla degradable: un fallo transitorio de la limpieza no bloquea el signup.
      try {
        await demoCleanup.borrarExpirados();
      } catch (err) {
        console.error(
          'Error al limpiar cuentas demo expiradas (no bloquea la creación del demo)',
          err instanceof Error ? err.stack : String(err),
        );
      }

      const { token, expiresAt } = await crearDemo.execute();
      res.setHeader('Set-Cookie', serializeSessionCookie(token, expiresAt));
      res.redirect(302, '/');
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
export function registrarAuthMe(router: Router, obtenerIdentidad: ObtenerIdentidadUseCase): void {
  router.get('/auth/me', async (req, res, next) => {
    try {
      const result = await obtenerIdentidad.execute({ userId: req.userId! });

      if (result.isFail()) {
        res.status(401).json({ message: result.getError().message });
        return;
      }

      const identidad = result.getValue();
      res.status(200).json({
        userId: identidad.userId,
        email: identidad.email,
        esDemo: identidad.esDemo,
      });
    } catch (err) {
      next(err);
    }
  });
}
