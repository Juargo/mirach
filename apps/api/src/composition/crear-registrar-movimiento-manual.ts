import type { PrismaClient } from '@prisma/client';
import type { ICryptoService } from '../application/ports/crypto-service.port';
import type { IBlindIndexService } from '../application/ports/blind-index-service.port';
import type { ILogger } from '../application/ports/logger.port';

import { RegistrarMovimientoManualUseCase } from '../application/use-cases/registrar-movimiento-manual.use-case';
import { PrismaRegistrarMovimientoManualRepository } from '../infrastructure/persistence/prisma-registrar-movimiento-manual.repository';
import { PrismaCategoriaRepository } from '../infrastructure/persistence/prisma-categoria.repository';

/**
 * crearRegistrarMovimientoManual — ensambla el grafo de dependencias para
 * RegistrarMovimientoManualUseCase (US-058, D-04/D-08, T-17).
 *
 * Mirrors `crearCommitIngesta` in structure and conventions:
 *   - PrismaRegistrarMovimientoManualRepository implementa IRegistrarMovimientoManualWriter
 *     (asegurarCuentaManual + registrar) — D-04/D-05/D-08.
 *   - PrismaCategoriaRepository implementa ICategoriaRepository (listarConPatrones
 *     para la validación de Gasto — D-11, step 3).
 *   - Same `crypto` + `blindIndex` instances from the composition root
 *     (ADR-013/ADR-035: NEVER re-derive the key inside a creator helper).
 *   - Same `logger` instance from the composition root (ADR-033).
 *
 * The FK resolution (Bucket → BUCKET_IDS) lives in the Prisma adapter, not
 * in the use case (ADR-005, D-08).
 */
export function crearRegistrarMovimientoManual(
  prisma: PrismaClient,
  crypto: ICryptoService,
  blindIndex: IBlindIndexService,
  logger: ILogger,
): RegistrarMovimientoManualUseCase {
  return new RegistrarMovimientoManualUseCase(
    // Writer: sentinel upsert (asegurarCuentaManual) + single Transaccion.create (registrar)
    new PrismaRegistrarMovimientoManualRepository(prisma, crypto, blindIndex),
    // Catalog reader: listarConPatrones for Gasto cascade validation (D-11 step 3)
    new PrismaCategoriaRepository(prisma),
    logger,
  );
}
