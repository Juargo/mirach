import type { PrismaClient } from '@prisma/client';
import type { ICryptoService } from '../application/ports/crypto-service.port';
import type { IBlindIndexService } from '../application/ports/blind-index-service.port';
import type { ILogger } from '../application/ports/logger.port';

import { CommitIngestaUseCase } from '../application/use-cases/commit-ingesta.use-case';
import { EjecutarPipelineIngestaUseCase } from '../application/use-cases/ejecutar-pipeline-ingesta.use-case';
import { CategorizarTransaccionUseCase } from '../application/use-cases/categorizar-transaccion.use-case';
import { DetectarDuplicadosUseCase } from '../application/use-cases/detectar-duplicados.use-case';
import { PersistTransactionsUseCase } from '../application/use-cases/persist-transactions.use-case';
import { IngestFileUseCase } from '../application/use-cases/ingest-file.use-case';
import { DetectBankUseCase } from '../application/use-cases/detect-bank.use-case';
import { DetectPdfBankUseCase } from '../application/use-cases/detect-pdf-bank.use-case';
import { ValidateStructureUseCase } from '../application/use-cases/validate-structure.use-case';
import { ValidatePdfStructureUseCase } from '../application/use-cases/validate-pdf-structure.use-case';
import { NormalizeTransactionsUseCase } from '../application/use-cases/normalize-transactions.use-case';
import { NormalizePdfTransactionsUseCase } from '../application/use-cases/normalize-pdf-transactions.use-case';

import { ExcelBankDetectorService } from '../infrastructure/excel/excel-bank-detector.service';
import { ExcelStructureValidatorService } from '../infrastructure/excel/excel-structure-validator.service';
import { ExcelTransactionNormalizerService } from '../infrastructure/excel/excel-transaction-normalizer.service';
import { PdfjsBankDetectorService } from '../infrastructure/pdf/pdfjs-bank-detector.service';
import { PdfjsStructureValidatorService } from '../infrastructure/pdf/pdfjs-structure-validator.service';
import { PdfjsTransactionNormalizerService } from '../infrastructure/pdf/pdfjs-transaction-normalizer.service';

import { PrismaAccountRepository } from '../infrastructure/persistence/prisma-account.repository';
import { PrismaIngestaRepository } from '../infrastructure/persistence/prisma-ingesta.repository';
import { PrismaRegistrarIngestaFallidaRepository } from '../infrastructure/persistence/prisma-registrar-ingesta-fallida.repository';
import { PrismaCatalogoClasificacionRepository } from '../infrastructure/persistence/prisma-catalogo-clasificacion.repository';
import { PrismaCategoriaRepository } from '../infrastructure/persistence/prisma-categoria.repository';
import { PrismaTransaccionExistenteReader } from '../infrastructure/persistence/prisma-transaccion-existente.reader';

/**
 * crearCommitIngesta — ensambla el grafo del CommitIngestaUseCase (US-057 PR4).
 *
 * Mirrors `crearProcessIngesta` in structure. Wires:
 *   - EjecutarPipelineIngestaUseCase (shared front, D-01)
 *   - PrismaAccountRepository (write — ensure() called by CommitIngestaUseCase
 *     OUTSIDE the extracted front, D-01/7b)
 *   - DetectarDuplicadosUseCase → PrismaTransaccionExistenteReader (crypto
 *     MANDATORY — D-17, descripcion decrypted for natural-key comparison)
 *   - PrismaCatalogoClasificacionRepository (patterns for auto-classify, D-10)
 *   - PrismaCategoriaRepository (ALL own categories: membership + bucket map, D-10/D-15)
 *   - CategorizarTransaccionUseCase (per-row auto-classifier)
 *   - PersistTransactionsUseCase → PrismaIngestaRepository (single write, D-11)
 *   - PrismaRegistrarIngestaFallidaRepository (FALLIDA registration)
 *
 * No `BUCKET_IDS` is passed to CommitIngestaUseCase — FK resolution lives in
 * `aPersistencia` (transaccion.mapper.ts), not in the application use case (D-15, ADR-005).
 *
 * ADR-033: `logger` is the SAME instance from container.ts.
 * ADR-013: `crypto` is the single shared instance (same key as write path).
 * Blind index: SAME derived instance (numeroCuentaBlindIndex must match ensure()).
 */
export function crearCommitIngesta(
  prisma: PrismaClient,
  crypto: ICryptoService,
  blindIndex: IBlindIndexService,
  logger: ILogger,
): CommitIngestaUseCase {
  const ejecutarPipelineUseCase = new EjecutarPipelineIngestaUseCase(
    new IngestFileUseCase(logger),
    new DetectBankUseCase(new ExcelBankDetectorService(), logger),
    new DetectPdfBankUseCase(new PdfjsBankDetectorService(), logger),
    new ValidateStructureUseCase(new ExcelStructureValidatorService(), logger),
    new ValidatePdfStructureUseCase(
      new PdfjsStructureValidatorService(),
      logger,
    ),
    new NormalizeTransactionsUseCase(
      new ExcelTransactionNormalizerService(),
      logger,
    ),
    new NormalizePdfTransactionsUseCase(
      new PdfjsTransactionNormalizerService(),
      logger,
    ),
    logger,
  );

  return new CommitIngestaUseCase(
    ejecutarPipelineUseCase,
    // Write: ensure() creates/finds Account (D-01/7b — called OUTSIDE the extracted front)
    new PrismaAccountRepository(prisma, crypto, blindIndex),
    // Dedup against current DB state (D-17 crypto MANDATORY — decrypts descripcion)
    new DetectarDuplicadosUseCase(
      new PrismaTransaccionExistenteReader(prisma, crypto),
      logger,
    ),
    // Patterns for auto-classification (REQUIRED, fail-closed, D-10)
    new PrismaCatalogoClasificacionRepository(prisma),
    // ALL own categories — membership + bucket map (REQUIRED, fail-closed, D-10/D-15)
    new PrismaCategoriaRepository(prisma),
    // Per-row auto-classifier
    new CategorizarTransaccionUseCase(logger),
    // Single write architecture: commit persists through this intermediary (D-11/8a)
    new PersistTransactionsUseCase(
      new PrismaIngestaRepository(prisma, crypto),
      logger,
    ),
    // FALLIDA registration (US-004)
    new PrismaRegistrarIngestaFallidaRepository(prisma),
    logger,
  );
}
