import type { PrismaClient } from '@prisma/client';

import type { Env } from '../config/env';
import type { IBlindIndexService } from '../application/ports/blind-index-service.port';
import type { ICryptoService } from '../application/ports/crypto-service.port';
import type { ILogger } from '../application/ports/logger.port';

import { CrearCuentaAnonimaUseCase } from '../application/use-cases/crear-cuenta-anonima.use-case';
import { VincularIdentidadUseCase } from '../application/use-cases/vincular-identidad.use-case';

import { PrismaCuentaAnonimaRepository } from '../infrastructure/persistence/prisma-cuenta-anonima.repository';
import { PrismaSessionRepository } from '../infrastructure/persistence/prisma-session.repository';
import { Sha256SessionTokenService } from '../infrastructure/http/auth/sha256-session-token.service';
import { SystemReloj } from '../infrastructure/http/auth/system-reloj';
import { IpRateLimiter } from '../infrastructure/http/auth/ip-rate-limiter';

/**
 * Alta anónima (ADR-013 §6): 10 por IP por hora, y un alta exitosa nunca
 * libera el presupuesto. Es el único freno a la creación masiva de cuentas.
 */
const ALTA_RATE_LIMIT_KEY_PREFIX = 'alta-anonima:ip:';
const ALTA_RATE_LIMIT_MAX_PER_IP = 10;
const ALTA_RATE_LIMIT_WINDOW_MS = 60 * 60_000;

/** Vinculación: mismo presupuesto que las rutas de token nativo. */
const VINCULAR_RATE_LIMIT_KEY_PREFIX = 'vincular:ip:';
const VINCULAR_RATE_LIMIT_MAX_ATTEMPTS_PER_IP = 30;
const VINCULAR_RATE_LIMIT_WINDOW_MS = 15 * 60_000;

/** CuentaAnonimaGraph — alta y vinculación de cuentas anónimas (ADR-013). */
export interface CuentaAnonimaGraph {
  readonly crearCuentaAnonima: CrearCuentaAnonimaUseCase;
  readonly vincularIdentidad: VincularIdentidadUseCase;
  readonly altaRateLimiter: IpRateLimiter;
  readonly vincularRateLimiter: IpRateLimiter;
}

/**
 * crearCuentaAnonima — siempre activo: no depende de Apple ni de Google.
 * `blindIndex` y `crypto` son las MISMAS instancias del composition root (la
 * vinculación cifra el email, ADR-009).
 */
export function crearCuentaAnonima(
  prisma: PrismaClient,
  env: Pick<Env, 'CONSENTS_REQUIRED'>,
  blindIndex: IBlindIndexService,
  crypto: ICryptoService,
  logger: ILogger,
): CuentaAnonimaGraph {
  const cuentas = new PrismaCuentaAnonimaRepository(prisma, blindIndex, crypto);
  const sessions = new PrismaSessionRepository(prisma);
  const tokens = new Sha256SessionTokenService();
  const reloj = new SystemReloj();

  return {
    crearCuentaAnonima: new CrearCuentaAnonimaUseCase(
      cuentas,
      sessions,
      tokens,
      reloj,
      logger,
      env.CONSENTS_REQUIRED,
    ),
    vincularIdentidad: new VincularIdentidadUseCase(
      cuentas,
      sessions,
      tokens,
      reloj,
      logger,
    ),
    altaRateLimiter: new IpRateLimiter(
      ALTA_RATE_LIMIT_KEY_PREFIX,
      ALTA_RATE_LIMIT_MAX_PER_IP,
      ALTA_RATE_LIMIT_WINDOW_MS,
    ),
    vincularRateLimiter: new IpRateLimiter(
      VINCULAR_RATE_LIMIT_KEY_PREFIX,
      VINCULAR_RATE_LIMIT_MAX_ATTEMPTS_PER_IP,
      VINCULAR_RATE_LIMIT_WINDOW_MS,
    ),
  };
}
