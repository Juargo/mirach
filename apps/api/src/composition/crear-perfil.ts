import type { PrismaClient } from '@prisma/client';

import type { ICryptoService } from '../application/ports/crypto-service.port';
import type { IBlindIndexService } from '../application/ports/blind-index-service.port';
import type { ILogger } from '../application/ports/logger.port';

import { ActualizarPerfilUseCase } from '../application/use-cases/actualizar-perfil.use-case';
import { CambiarPasswordUseCase } from '../application/use-cases/cambiar-password.use-case';
import { DesvincularGoogleUseCase } from '../application/use-cases/desvincular-google.use-case';

import { Argon2PasswordHasher } from '../infrastructure/http/auth/argon2-password-hasher';
import { PrismaUserCredentialRepository } from '../infrastructure/persistence/prisma-user-credential.repository';
import { PrismaSessionRepository } from '../infrastructure/persistence/prisma-session.repository';
import { PrismaIdentidadGoogleRepository } from '../infrastructure/persistence/prisma-identidad-google.repository';

/**
 * PerfilGraph — las piezas de `/api/perfil*` que consume `registrarPerfil`
 * (US-040). Un único objeto (mirrors `CatalogoGraph`) en vez de parámetros
 * sueltos.
 *
 * `desvincularGoogle` vive ACÁ, no en `GoogleAuthGraph` (US-041, design
 * D-04, §3.4): debe funcionar cuando Google está apagado (sin
 * `GOOGLE_CLIENT_ID`), porque un usuario que se vinculó mientras Google
 * estaba activo debe poder desvincular después de un cambio de config.
 */
export interface PerfilGraph {
  readonly actualizarPerfil: ActualizarPerfilUseCase;
  readonly cambiarPassword: CambiarPasswordUseCase;
  readonly desvincularGoogle: DesvincularGoogleUseCase;
}

/**
 * crearPerfil — ensambla el grafo de edición de perfil (US-040, design.md
 * §3.4/§5.1). Mirrors `crearAuthGoogle`: construye sus propios adapters
 * stateless (`PrismaUserCredentialRepository`, `PrismaSessionRepository`,
 * `Argon2PasswordHasher`) sobre las instancias COMPARTIDAS que recibe.
 *
 * GUARD (non-negotiable): NUNCA llama `deriveBlindIndexKey`, `new
 * AesGcmCryptoService` ni `new HmacBlindIndexService` — recibe las
 * instancias `crypto`/`blindIndex` que el composition root construyó UNA
 * sola vez (`container.ts`). Una segunda derivación sería exactamente el
 * hazard de clase que causó el incidente de producción del 2026-08-02
 * (design.md §0).
 */
export function crearPerfil(
  prisma: PrismaClient,
  crypto: ICryptoService,
  blindIndex: IBlindIndexService,
  logger: ILogger,
): PerfilGraph {
  const creds = new PrismaUserCredentialRepository(prisma, crypto, blindIndex);
  const sessions = new PrismaSessionRepository(prisma);
  const identidades = new PrismaIdentidadGoogleRepository(prisma, blindIndex);
  const hasher = new Argon2PasswordHasher();

  return {
    actualizarPerfil: new ActualizarPerfilUseCase(creds, hasher, logger),
    cambiarPassword: new CambiarPasswordUseCase(
      creds,
      sessions,
      hasher,
      logger,
    ),
    desvincularGoogle: new DesvincularGoogleUseCase(
      creds,
      identidades,
      hasher,
      logger,
    ),
  };
}
