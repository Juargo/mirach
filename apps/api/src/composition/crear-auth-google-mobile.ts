import type { PrismaClient } from '@prisma/client';

import type { Env } from '../config/env';
import type { IBlindIndexService } from '../application/ports/blind-index-service.port';
import type { ILogger } from '../application/ports/logger.port';
import type { IVerificadorIdTokenExterno } from '../application/ports/verificador-identidad-externa.port';

import { LoginConGoogleUseCase } from '../application/use-cases/login-con-google.use-case';

import { GoogleIdTokenVerifier } from '../infrastructure/oidc/google-id-token.adapter';
import { PrismaIdentidadGoogleRepository } from '../infrastructure/persistence/prisma-identidad-google.repository';
import { PrismaSessionRepository } from '../infrastructure/persistence/prisma-session.repository';
import { Sha256SessionTokenService } from '../infrastructure/http/auth/sha256-session-token.service';
import { SystemReloj } from '../infrastructure/http/auth/system-reloj';
import { IpRateLimiter } from '../infrastructure/http/auth/ip-rate-limiter';

/** Prefijo de claves + presupuesto del limitador del endpoint mobile (design §6.4/tasks canonical literal). */
const GOOGLE_TOKEN_RATE_LIMIT_KEY_PREFIX = 'google-token:ip:';
const GOOGLE_TOKEN_RATE_LIMIT_MAX_ATTEMPTS_PER_IP = 30;
const GOOGLE_TOKEN_RATE_LIMIT_WINDOW_MS = 15 * 60_000;

/**
 * GoogleAuthMobileGraph — las piezas del login con Google mobile (M1, native
 * id_token, ADR-035) que consume el composition root (design §7).
 *
 * Deliberadamente NO comparte campos con `GoogleAuthGraph` (el grafo web):
 * son dos gates de activación independientes (AUTH-22) — `loginConGoogle`
 * ES una segunda instancia propia, no la reutilizada del grafo web, para que
 * apagar uno nunca afecte al otro por acoplamiento accidental de estado.
 */
export interface GoogleAuthMobileGraph {
  readonly verificadorIdToken: IVerificadorIdTokenExterno;
  readonly loginConGoogle: LoginConGoogleUseCase;
  readonly googleTokenRateLimiter: IpRateLimiter;
}

/**
 * crearAuthGoogleMobile — ensambla el grafo de login con Google mobile, o
 * `undefined` si el feature está apagado (design §7 — activación por
 * presencia de `GOOGLE_CLIENT_ID_ANDROID`, AUTH-22). El *tipo* del retorno
 * es el seam de activación, igual que `crearAuthGoogle` — sin flag booleano
 * en el resto del código.
 *
 * Mirror de `crearAuthGoogle`: colaboradores stateless (`reloj`/`tokens`/
 * `sessions`) construidos INTERNAMENTE; `blindIndex` es la única excepción,
 * recibido ya construido para ser la MISMA instancia que deriva
 * `container.ts` (design §5.5, 4R carry-forward). `env.GOOGLE_CLIENT_ID_ANDROID`
 * llega acá YA validado por `loadEnv` (no vacío, no solo-blanco, con forma de
 * Android client ID) — el array de audiencias que recibe
 * `GoogleIdTokenVerifier` nunca puede quedar vacío por construcción (carry-over
 * 4R A1).
 *
 * ADR-033 slice A: `logger` es una excepción más a "colaboradores
 * construidos internamente" — misma instancia única del composition root,
 * propagada a la SEGUNDA `LoginConGoogleUseCase` para el debug step logging.
 */
export function crearAuthGoogleMobile(
  prisma: PrismaClient,
  env: Pick<Env, 'GOOGLE_CLIENT_ID_ANDROID'>,
  blindIndex: IBlindIndexService,
  logger: ILogger,
): GoogleAuthMobileGraph | undefined {
  if (env.GOOGLE_CLIENT_ID_ANDROID === undefined) {
    return undefined;
  }

  const reloj = new SystemReloj();
  const tokens = new Sha256SessionTokenService();
  const sessions = new PrismaSessionRepository(prisma);
  const identidades = new PrismaIdentidadGoogleRepository(prisma, blindIndex);

  return {
    verificadorIdToken: new GoogleIdTokenVerifier([
      env.GOOGLE_CLIENT_ID_ANDROID,
    ]),
    loginConGoogle: new LoginConGoogleUseCase(
      identidades,
      sessions,
      tokens,
      reloj,
      logger,
    ),
    googleTokenRateLimiter: new IpRateLimiter(
      GOOGLE_TOKEN_RATE_LIMIT_KEY_PREFIX,
      GOOGLE_TOKEN_RATE_LIMIT_MAX_ATTEMPTS_PER_IP,
      GOOGLE_TOKEN_RATE_LIMIT_WINDOW_MS,
    ),
  };
}
