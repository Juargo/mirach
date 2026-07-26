import type { PrismaClient } from '@prisma/client';

import type { Env } from '../config/env';

import { ValidarSesionUseCase } from '../application/use-cases/validar-sesion.use-case';
import { LoginUseCase } from '../application/use-cases/login.use-case';
import { LogoutUseCase } from '../application/use-cases/logout.use-case';
import { ObtenerIdentidadUseCase } from '../application/use-cases/obtener-identidad.use-case';
import { CrearDemoUseCase } from '../application/use-cases/crear-demo.use-case';

import { Argon2PasswordHasher } from '../infrastructure/http/auth/argon2-password-hasher';
import { Sha256SessionTokenService } from '../infrastructure/http/auth/sha256-session-token.service';
import { SystemReloj } from '../infrastructure/http/auth/system-reloj';
import { LoginRateLimiter } from '../infrastructure/http/auth/login-rate-limiter';
import { DemoRateLimiter } from '../infrastructure/http/auth/demo-rate-limiter';
import { DemoCleanupService } from '../infrastructure/http/auth/demo-cleanup.service';

import { PrismaSessionRepository } from '../infrastructure/persistence/prisma-session.repository';
import { PrismaUserCredentialRepository } from '../infrastructure/persistence/prisma-user-credential.repository';
import { PrismaDemoRepository } from '../infrastructure/persistence/prisma-demo.repository';

/**
 * AuthGraph — las piezas de autenticación que consume el composition root.
 * `validarSesion` la usa el session middleware; el resto, los handlers de
 * /api/auth (login/logout/me/demo).
 */
export interface AuthGraph {
  readonly validarSesion: ValidarSesionUseCase;
  readonly login: LoginUseCase;
  readonly logout: LogoutUseCase;
  readonly obtenerIdentidad: ObtenerIdentidadUseCase;
  readonly crearDemo: CrearDemoUseCase;
  readonly loginRateLimiter: LoginRateLimiter;
  readonly demoRateLimiter: DemoRateLimiter;
  readonly demoCleanup: DemoCleanupService;
}

/**
 * crearAuth — ensambla el grafo de autenticación (ADR-028/029). Réplica del
 * wiring de `AuthModule` (Nest), consolidando la construcción compartida de
 * sessions/tokens/reloj que antes estaba dispersa. `validarSesion` sale de acá
 * (una sola vez) para el session middleware.
 *
 * ADR-029: recibe `env` inyectado — `LoginRateLimiter` se construye
 * directamente desde `env.LOGIN_RATELIMIT_*` (ya validados por `loadEnv()`),
 * sin la validación ad-hoc de la extinta `readRateLimitConfigFromEnv()`.
 *
 * Nota (ADR-028): la limpieza DIARIA de demos (`DemoCleanupService.limpiarDiario`)
 * la agenda `programarLimpiezaDemo` (node-cron) en el bootstrap. La limpieza
 * lazy en `GET /demo` también corre.
 */
export function crearAuth(prisma: PrismaClient, env: Env): AuthGraph {
  const reloj = new SystemReloj();
  const tokens = new Sha256SessionTokenService();
  const hasher = new Argon2PasswordHasher();

  const sessions = new PrismaSessionRepository(prisma);
  const creds = new PrismaUserCredentialRepository(prisma);
  const demoRepo = new PrismaDemoRepository(prisma, reloj);

  return {
    validarSesion: new ValidarSesionUseCase(sessions, tokens, reloj),
    login: new LoginUseCase(creds, hasher, sessions, tokens, reloj),
    logout: new LogoutUseCase(sessions, tokens),
    obtenerIdentidad: new ObtenerIdentidadUseCase(creds),
    crearDemo: new CrearDemoUseCase(demoRepo, tokens, reloj),
    loginRateLimiter: new LoginRateLimiter({
      maxAttemptsPerEmail: env.LOGIN_RATELIMIT_MAX_EMAIL,
      maxAttemptsPerIp: env.LOGIN_RATELIMIT_MAX_IP,
      windowMs: env.LOGIN_RATELIMIT_WINDOW_MS,
    }),
    demoRateLimiter: new DemoRateLimiter(),
    demoCleanup: new DemoCleanupService(prisma, reloj),
  };
}
