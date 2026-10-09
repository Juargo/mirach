import type { PrismaClient } from '@prisma/client';

import type { Env } from '../config/env';
import type { IBlindIndexService } from '../application/ports/blind-index-service.port';
import type { ICryptoService } from '../application/ports/crypto-service.port';
import type { ILogger } from '../application/ports/logger.port';
import type { ITareasEnSegundoPlano } from '../application/ports/tareas-en-segundo-plano.port';
import type { IClienteAppleAuth } from '../application/ports/cliente-apple-auth.port';
import type { IVerificadorIdTokenApple } from '../application/ports/verificador-identidad-apple.port';

import { LoginConAppleUseCase } from '../application/use-cases/login-con-apple.use-case';

import { AppleIdTokenVerifier } from '../infrastructure/oidc/apple-id-token.adapter';
import { PrismaIdentidadAppleRepository } from '../infrastructure/persistence/prisma-identidad-apple.repository';
import { PrismaRefreshTokenAppleRepository } from '../infrastructure/persistence/prisma-refresh-token-apple.repository';
import { PrismaSessionRepository } from '../infrastructure/persistence/prisma-session.repository';
import { Sha256SessionTokenService } from '../infrastructure/http/auth/sha256-session-token.service';
import { SystemReloj } from '../infrastructure/http/auth/system-reloj';
import { IpRateLimiter } from '../infrastructure/http/auth/ip-rate-limiter';

/** Presupuesto del limitador propio del endpoint (mismo que Google mobile). */
const APPLE_TOKEN_RATE_LIMIT_KEY_PREFIX = 'apple-token:ip:';
const APPLE_TOKEN_RATE_LIMIT_MAX_ATTEMPTS_PER_IP = 30;
const APPLE_TOKEN_RATE_LIMIT_WINDOW_MS = 15 * 60_000;

/**
 * AppleAuthGraph — las piezas del login con Apple (identity token nativo) que
 * consume el composition root. Gate de activación independiente del de Google.
 */
export interface AppleAuthGraph {
  readonly verificadorIdToken: IVerificadorIdTokenApple;
  readonly loginConApple: LoginConAppleUseCase;
  readonly appleTokenRateLimiter: IpRateLimiter;
}

/**
 * crearAuthApple — ensambla el grafo, o `undefined` si `APPLE_BUNDLE_ID` está
 * ausente (activación por presencia; el *tipo* del retorno es el seam, sin
 * flag booleano). `blindIndex` y `crypto` son las MISMAS instancias del
 * composition root (el alta cifra el email, ADR-013/ADR-041); el resto de los
 * colaboradores son stateless y se construyen acá. `clienteApple` (opcional,
 * T4) habilita el canje del authorizationCode y el guardado cifrado del
 * refresh token; sin él, el login ignora el code.
 */
export function crearAuthApple(
  prisma: PrismaClient,
  env: Pick<Env, 'APPLE_BUNDLE_ID'>,
  blindIndex: IBlindIndexService,
  crypto: ICryptoService,
  logger: ILogger,
  clienteApple: IClienteAppleAuth | undefined,
  tareas: ITareasEnSegundoPlano,
): AppleAuthGraph | undefined {
  if (env.APPLE_BUNDLE_ID === undefined) {
    return undefined;
  }

  const verificador = new AppleIdTokenVerifier(env.APPLE_BUNDLE_ID);

  return {
    verificadorIdToken: verificador,
    loginConApple: new LoginConAppleUseCase(
      new PrismaIdentidadAppleRepository(prisma, blindIndex, crypto),
      new PrismaSessionRepository(prisma),
      new Sha256SessionTokenService(),
      new SystemReloj(),
      logger,
      clienteApple,
      clienteApple && new PrismaRefreshTokenAppleRepository(prisma, crypto),
      verificador,
      tareas,
    ),
    appleTokenRateLimiter: new IpRateLimiter(
      APPLE_TOKEN_RATE_LIMIT_KEY_PREFIX,
      APPLE_TOKEN_RATE_LIMIT_MAX_ATTEMPTS_PER_IP,
      APPLE_TOKEN_RATE_LIMIT_WINDOW_MS,
    ),
  };
}
