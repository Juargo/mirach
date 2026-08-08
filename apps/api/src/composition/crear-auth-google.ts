import type { PrismaClient } from '@prisma/client';

import type { Env } from '../config/env';
import type { IBlindIndexService } from '../application/ports/blind-index-service.port';
import type { IIniciadorLoginExterno } from '../application/ports/verificador-identidad-externa.port';

import { LoginConGoogleUseCase } from '../application/use-cases/login-con-google.use-case';

import { OpenIdClientGoogleAdapter } from '../infrastructure/oidc/openid-client-google.adapter';
import { PrismaIdentidadGoogleRepository } from '../infrastructure/persistence/prisma-identidad-google.repository';
import { PrismaSessionRepository } from '../infrastructure/persistence/prisma-session.repository';
import { Sha256SessionTokenService } from '../infrastructure/http/auth/sha256-session-token.service';
import { SystemReloj } from '../infrastructure/http/auth/system-reloj';
import { IpRateLimiter } from '../infrastructure/http/auth/ip-rate-limiter';

/** Prefijo de claves + presupuesto del limitador compartido initiate+callback (design §6.4). */
const GOOGLE_RATE_LIMIT_KEY_PREFIX = 'google:ip:';
const GOOGLE_RATE_LIMIT_MAX_ATTEMPTS_PER_IP = 10;
const GOOGLE_RATE_LIMIT_WINDOW_MS = 15 * 60_000;

/**
 * GoogleAuthGraph — las piezas del login con Google que consume el
 * composition root (design §4.3). `iniciador` lo usa la ruta de inicio
 * (Slice C2); `loginConGoogle` lo usa la ruta de callback (Slice C2);
 * `googleRateLimiter` se comparte entre AMBAS rutas (design §6.4 — un
 * atacante que ya tiene un `state` válido puede reintentar el callback como
 * amplificador contra Google, así que initiate y callback consumen el mismo
 * presupuesto).
 */
export interface GoogleAuthGraph {
  readonly iniciador: IIniciadorLoginExterno;
  readonly loginConGoogle: LoginConGoogleUseCase;
  readonly googleRateLimiter: IpRateLimiter;
}

/**
 * crearAuthGoogle — ensambla el grafo de login con Google, o `undefined` si
 * el feature está apagado (design §4.3/§4.4 — activación por presencia,
 * AUTH-16). El *tipo* del retorno es el seam de activación: no hay ningún
 * flag booleano en el resto del código, `container.googleAuth !== undefined`
 * ES la pregunta "¿está prendido?".
 *
 * Mirror EXACTO de `crear-auth.ts`: `reloj`/`tokens`/`sessions` se
 * construyen ACÁ, internamente — son colaboradores stateless y baratos de
 * construir, no hay razón para exponerlos en la firma ni para reutilizar
 * las instancias de `crearAuth` (KISS). `blindIndex` es la ÚNICA excepción:
 * se recibe ya construido porque DEBE ser la MISMA instancia que
 * `container.ts` deriva una sola vez de `env.ENCRYPTION_KEY` — una segunda
 * derivación HKDF produciría un índice distinto y rompería todo link por
 * email en silencio (design §5.5, 4R carry-forward).
 */
export function crearAuthGoogle(
  prisma: PrismaClient,
  env: Pick<
    Env,
    'GOOGLE_CLIENT_ID' | 'GOOGLE_CLIENT_SECRET' | 'GOOGLE_REDIRECT_URI'
  >,
  blindIndex: IBlindIndexService,
): GoogleAuthGraph | undefined {
  if (
    env.GOOGLE_CLIENT_ID === undefined ||
    env.GOOGLE_CLIENT_SECRET === undefined
  ) {
    return undefined;
  }

  // env.ts garantiza (superRefine, ADR-029) que si las credenciales están
  // presentes, GOOGLE_REDIRECT_URI también lo está (default local en
  // development/test, obligatoria en producción) — nunca undefined acá.
  const redirectUri = env.GOOGLE_REDIRECT_URI!;

  const reloj = new SystemReloj();
  const tokens = new Sha256SessionTokenService();
  const sessions = new PrismaSessionRepository(prisma);

  const adapter = new OpenIdClientGoogleAdapter(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    redirectUri,
  );
  const identidades = new PrismaIdentidadGoogleRepository(prisma, blindIndex);

  return {
    iniciador: adapter,
    loginConGoogle: new LoginConGoogleUseCase(
      identidades,
      sessions,
      tokens,
      reloj,
    ),
    googleRateLimiter: new IpRateLimiter(
      GOOGLE_RATE_LIMIT_KEY_PREFIX,
      GOOGLE_RATE_LIMIT_MAX_ATTEMPTS_PER_IP,
      GOOGLE_RATE_LIMIT_WINDOW_MS,
    ),
  };
}
