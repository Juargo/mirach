import type { PrismaClient } from '@prisma/client';

import type { Env } from '../config/env';
import type { ICryptoService } from '../application/ports/crypto-service.port';
import type { IBlindIndexService } from '../application/ports/blind-index-service.port';
import type { ILogger } from '../application/ports/logger.port';

import { ValidarSesionUseCase } from '../application/use-cases/validar-sesion.use-case';
import { Email } from '../domain/value-objects/email';
import { LoginUseCase } from '../application/use-cases/login.use-case';
import { LogoutUseCase } from '../application/use-cases/logout.use-case';
import { ObtenerIdentidadUseCase } from '../application/use-cases/obtener-identidad.use-case';

import { Argon2PasswordHasher } from '../infrastructure/http/auth/argon2-password-hasher';
import { Sha256SessionTokenService } from '../infrastructure/http/auth/sha256-session-token.service';
import { SystemReloj } from '../infrastructure/http/auth/system-reloj';
import { LoginRateLimiter } from '../infrastructure/http/auth/login-rate-limiter';

import { PrismaSessionRepository } from '../infrastructure/persistence/prisma-session.repository';
import { PrismaUserCredentialRepository } from '../infrastructure/persistence/prisma-user-credential.repository';

/**
 * AuthGraph — las piezas de autenticación que consume el composition root.
 * `validarSesion` la usa el session middleware; el resto, los handlers de
 * /api/auth (login/logout/me).
 */
export interface AuthGraph {
  readonly validarSesion: ValidarSesionUseCase;
  readonly login: LoginUseCase;
  readonly logout: LogoutUseCase;
  readonly obtenerIdentidad: ObtenerIdentidadUseCase;
  readonly loginRateLimiter: LoginRateLimiter;
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
 * US-035: `crypto`/`blindIndex` se reciben ya construidos (no se instancian
 * acá) — el caller (`container.ts`) es dueño de decodificar
 * `env.ENCRYPTION_KEY` y derivar la clave del blind index UNA sola vez,
 * mismo patrón que `crearProcessIngesta` recibe `crypto` inyectado.
 *
 * ADR-033 slice A: `logger` se recibe ya construido — mismo patrón que
 * `crypto`/`blindIndex`, la ÚNICA instancia del composition root, propagada
 * a los use cases de auth para el debug step logging (login, logout,
 * validar-sesion, obtener-identidad).
 */
export function crearAuth(
  prisma: PrismaClient,
  env: Pick<
    Env,
    | 'LOGIN_RATELIMIT_MAX_EMAIL'
    | 'LOGIN_RATELIMIT_MAX_IP'
    | 'LOGIN_RATELIMIT_WINDOW_MS'
    | 'REVIEW_LOGIN_EMAIL'
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

  // ADR-051: env.ts validates the address with zod, the domain with its own
  // regex. If they ever disagree, fail closed (password login refused for all)
  // instead of throwing while the container is built, which would take the
  // whole API down. The address itself is never logged.
  let emailPermitido: Email | null = null;
  if (env.REVIEW_LOGIN_EMAIL !== undefined) {
    const parsed = Email.crear(env.REVIEW_LOGIN_EMAIL);
    if (parsed.isOk()) {
      emailPermitido = parsed.getValue();
    } else {
      logger.warn(
        'REVIEW_LOGIN_EMAIL is not a valid email for the domain: password login stays disabled',
      );
    }
  }

  return {
    validarSesion: new ValidarSesionUseCase(sessions, tokens, reloj, logger),
    login: new LoginUseCase(
      creds,
      hasher,
      sessions,
      tokens,
      reloj,
      logger,
      emailPermitido,
    ),
    logout: new LogoutUseCase(sessions, tokens, logger),
    obtenerIdentidad: new ObtenerIdentidadUseCase(creds, logger),
    loginRateLimiter: new LoginRateLimiter({
      maxAttemptsPerEmail: env.LOGIN_RATELIMIT_MAX_EMAIL,
      maxAttemptsPerIp: env.LOGIN_RATELIMIT_MAX_IP,
      windowMs: env.LOGIN_RATELIMIT_WINDOW_MS,
    }),
  };
}
