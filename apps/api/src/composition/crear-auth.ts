import type { PrismaClient } from '@prisma/client';

import type { Env } from '../config/env';
import type { ICryptoService } from '../application/ports/crypto-service.port';
import type { IBlindIndexService } from '../application/ports/blind-index-service.port';
import type { ILogger } from '../application/ports/logger.port';

import { ValidarSesionUseCase } from '../application/use-cases/validar-sesion.use-case';
import { LoginUseCase } from '../application/use-cases/login.use-case';
import { LogoutUseCase } from '../application/use-cases/logout.use-case';
import { ObtenerIdentidadUseCase } from '../application/use-cases/obtener-identidad.use-case';
import { CrearDemoUseCase } from '../application/use-cases/crear-demo.use-case';

import { Argon2PasswordHasher } from '../infrastructure/http/auth/argon2-password-hasher';
import { Sha256SessionTokenService } from '../infrastructure/http/auth/sha256-session-token.service';
import { SystemReloj } from '../infrastructure/http/auth/system-reloj';
import { LoginRateLimiter } from '../infrastructure/http/auth/login-rate-limiter';
import { IpRateLimiter } from '../infrastructure/http/auth/ip-rate-limiter';
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
  readonly demoRateLimiter: IpRateLimiter;
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
 * `env` se acota a `Pick<Env, 'LOGIN_RATELIMIT_*'>` — defensa en profundidad,
 * consistente con el scoping de `createPrismaClient(env: Pick<Env,
 * 'DATABASE_URL'|'DIRECT_URL'>)`: `crearAuth` no lee ni necesita
 * `API_KEY`/`DATABASE_URL`/etc., así que su firma no debe poder tocarlos.
 *
 * Nota (ADR-028): la limpieza DIARIA de demos (`DemoCleanupService.limpiarDiario`)
 * la agenda `programarLimpiezaDemo` (node-cron) en el bootstrap. La limpieza
 * lazy en `GET /demo` también corre.
 *
 * US-035: `crypto`/`blindIndex` se reciben ya construidos (no se instancian
 * acá) — el caller (`container.ts`) es dueño de decodificar
 * `env.ENCRYPTION_KEY` y derivar la clave del blind index UNA sola vez,
 * mismo patrón que `crearProcessIngesta` recibe `crypto` inyectado. Slice 2:
 * `demoRepo` también los necesita — el Account demo cifra `numeroCuenta` +
 * computa su blind index igual que cualquier cuenta real.
 *
 * ADR-033 slice A: `logger` se recibe ya construido — mismo patrón que
 * `crypto`/`blindIndex`, la ÚNICA instancia del composition root, propagada
 * a los 5 use cases de auth para el debug step logging (login, logout,
 * validar-sesion, obtener-identidad, crear-demo).
 */
export function crearAuth(
  prisma: PrismaClient,
  env: Pick<
    Env,
    | 'LOGIN_RATELIMIT_MAX_EMAIL'
    | 'LOGIN_RATELIMIT_MAX_IP'
    | 'LOGIN_RATELIMIT_WINDOW_MS'
  >,
  crypto: ICryptoService,
  blindIndex: IBlindIndexService,
  logger: ILogger,
): AuthGraph {
  const reloj = new SystemReloj();
  const tokens = new Sha256SessionTokenService();
  const hasher = new Argon2PasswordHasher();

  const sessions = new PrismaSessionRepository(prisma);
  const creds = new PrismaUserCredentialRepository(prisma, crypto, blindIndex);
  const demoRepo = new PrismaDemoRepository(prisma, reloj, crypto, blindIndex);

  return {
    validarSesion: new ValidarSesionUseCase(sessions, tokens, reloj, logger),
    login: new LoginUseCase(creds, hasher, sessions, tokens, reloj, logger),
    logout: new LogoutUseCase(sessions, tokens, logger),
    obtenerIdentidad: new ObtenerIdentidadUseCase(creds, logger),
    crearDemo: new CrearDemoUseCase(demoRepo, tokens, reloj, logger),
    loginRateLimiter: new LoginRateLimiter({
      maxAttemptsPerEmail: env.LOGIN_RATELIMIT_MAX_EMAIL,
      maxAttemptsPerIp: env.LOGIN_RATELIMIT_MAX_IP,
      windowMs: env.LOGIN_RATELIMIT_WINDOW_MS,
    }),
    demoRateLimiter: new IpRateLimiter('demo:ip:'),
    demoCleanup: new DemoCleanupService(prisma, reloj),
  };
}
