import type { PrismaClient } from '@prisma/client';

import { ValidarSesionUseCase } from '../application/use-cases/validar-sesion.use-case';
import { LoginUseCase } from '../application/use-cases/login.use-case';
import { LogoutUseCase } from '../application/use-cases/logout.use-case';
import { ObtenerIdentidadUseCase } from '../application/use-cases/obtener-identidad.use-case';
import { CrearDemoUseCase } from '../application/use-cases/crear-demo.use-case';

import { Argon2PasswordHasher } from '../infrastructure/http/auth/argon2-password-hasher';
import { Sha256SessionTokenService } from '../infrastructure/http/auth/sha256-session-token.service';
import { SystemReloj } from '../infrastructure/http/auth/system-reloj';
import { LoginRateLimiter, readRateLimitConfigFromEnv } from '../infrastructure/http/auth/login-rate-limiter';
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
 * crearAuth — ensambla el grafo de autenticación (ADR-028). Réplica del wiring
 * de `AuthModule` (Nest), consolidando la construcción compartida de
 * sessions/tokens/reloj que antes estaba dispersa. `validarSesion` sale de acá
 * (una sola vez) para el session middleware.
 *
 * Nota (cutover, Slice 8): `DemoCleanupService` trae un método `@Cron`
 * (limpieza diaria) que NO corre sin `@nestjs/schedule` — habrá que reemplazar
 * ese scheduler post-cutover. La limpieza lazy en `GET /demo` sí funciona.
 */
export function crearAuth(prisma: PrismaClient): AuthGraph {
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
    loginRateLimiter: new LoginRateLimiter(readRateLimitConfigFromEnv()),
    demoRateLimiter: new DemoRateLimiter(),
    demoCleanup: new DemoCleanupService(prisma, reloj),
  };
}
