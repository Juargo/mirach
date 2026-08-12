import type { PrismaClient } from '@prisma/client';

import type { ICryptoService } from '../application/ports/crypto-service.port';
import type { IBlindIndexService } from '../application/ports/blind-index-service.port';
import type { ILogger } from '../application/ports/logger.port';

import { ActualizarPerfilUseCase } from '../application/use-cases/actualizar-perfil.use-case';

import { Argon2PasswordHasher } from '../infrastructure/http/auth/argon2-password-hasher';
import { PrismaUserCredentialRepository } from '../infrastructure/persistence/prisma-user-credential.repository';

/**
 * PerfilGraph — las piezas de `PATCH /api/perfil` que consume
 * `registrarPerfil` (US-040, PR#1). Un único objeto (mirrors `CatalogoGraph`)
 * en vez de parámetros sueltos. `cambiarPassword` se suma en PR#2.
 */
export interface PerfilGraph {
  readonly actualizarPerfil: ActualizarPerfilUseCase;
}

/**
 * crearPerfil — ensambla el grafo de edición de perfil (US-040, design.md
 * §3.4/§5.1). Mirrors `crearAuthGoogle`: construye sus propios adapters
 * stateless (`PrismaUserCredentialRepository`, `Argon2PasswordHasher`) sobre
 * las instancias COMPARTIDAS que recibe.
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
  const hasher = new Argon2PasswordHasher();

  return {
    actualizarPerfil: new ActualizarPerfilUseCase(creds, hasher, logger),
  };
}
