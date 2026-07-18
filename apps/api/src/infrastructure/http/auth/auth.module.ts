import { Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { SessionGuard } from './session.guard';
import { LoginRateLimiter, leerRateLimitConfigDesdeEnv } from './login-rate-limiter';
import { Argon2PasswordHasher } from './argon2-password-hasher';
import { Sha256SessionTokenService } from './sha256-session-token.service';
import { SystemReloj } from './system-reloj';
import { LoginUseCase } from '../../../application/use-cases/login.use-case';
import { LogoutUseCase } from '../../../application/use-cases/logout.use-case';
import { ValidarSesionUseCase } from '../../../application/use-cases/validar-sesion.use-case';
import { ObtenerIdentidadUseCase } from '../../../application/use-cases/obtener-identidad.use-case';
import {
  USER_CREDENTIAL_REPOSITORY,
  IUserCredentialRepository,
} from '../../../application/ports/user-credential-repository.port';
import { PASSWORD_HASHER, IPasswordHasher } from '../../../application/ports/password-hasher.port';
import {
  SESSION_REPOSITORY,
  ISessionRepository,
} from '../../../application/ports/session-repository.port';
import {
  SESSION_TOKEN_SERVICE,
  ISessionTokenService,
} from '../../../application/ports/session-token.port';
import { RELOJ, IReloj } from '../../../application/ports/reloj.port';
import { PrismaUserCredentialRepository } from '../../persistence/prisma-user-credential.repository';
import { PrismaSessionRepository } from '../../persistence/prisma-session.repository';
import { PrismaService } from '../../persistence/prisma.service';

/**
 * AuthModule — composition root de login/logout/sesión (design.md §5.6).
 *
 * Providers vía `useFactory` con clases planas (sin decoradores) — ADR-005.
 * `PrismaService` es `@Global` (de `PrismaModule`), se inyecta directo.
 *
 * Exporta `SessionGuard` para que `AppModule` lo registre como el segundo
 * `APP_GUARD` global (AC-06 — DESPUÉS de `ApiKeyGuard`).
 */
@Module({
  controllers: [AuthController],
  providers: [
    {
      provide: USER_CREDENTIAL_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaUserCredentialRepository(prisma),
      inject: [PrismaService],
    },
    { provide: PASSWORD_HASHER, useFactory: () => new Argon2PasswordHasher() },
    {
      provide: SESSION_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaSessionRepository(prisma),
      inject: [PrismaService],
    },
    { provide: SESSION_TOKEN_SERVICE, useFactory: () => new Sha256SessionTokenService() },
    { provide: RELOJ, useFactory: () => new SystemReloj() },
    {
      provide: LoginUseCase,
      useFactory: (
        creds: IUserCredentialRepository,
        hasher: IPasswordHasher,
        sessions: ISessionRepository,
        tokens: ISessionTokenService,
        reloj: IReloj,
      ) => new LoginUseCase(creds, hasher, sessions, tokens, reloj),
      inject: [
        USER_CREDENTIAL_REPOSITORY,
        PASSWORD_HASHER,
        SESSION_REPOSITORY,
        SESSION_TOKEN_SERVICE,
        RELOJ,
      ],
    },
    {
      provide: ValidarSesionUseCase,
      useFactory: (sessions: ISessionRepository, tokens: ISessionTokenService, reloj: IReloj) =>
        new ValidarSesionUseCase(sessions, tokens, reloj),
      inject: [SESSION_REPOSITORY, SESSION_TOKEN_SERVICE, RELOJ],
    },
    {
      provide: LogoutUseCase,
      useFactory: (sessions: ISessionRepository, tokens: ISessionTokenService) =>
        new LogoutUseCase(sessions, tokens),
      inject: [SESSION_REPOSITORY, SESSION_TOKEN_SERVICE],
    },
    {
      provide: ObtenerIdentidadUseCase,
      useFactory: (creds: IUserCredentialRepository) => new ObtenerIdentidadUseCase(creds),
      inject: [USER_CREDENTIAL_REPOSITORY],
    },
    {
      provide: LoginRateLimiter,
      useFactory: () => new LoginRateLimiter(leerRateLimitConfigDesdeEnv()),
    },
    {
      provide: SessionGuard,
      useFactory: (reflector: Reflector, validarSesion: ValidarSesionUseCase) =>
        new SessionGuard(reflector, validarSesion),
      inject: [Reflector, ValidarSesionUseCase],
    },
  ],
  exports: [SessionGuard],
})
export class AuthModule {}
