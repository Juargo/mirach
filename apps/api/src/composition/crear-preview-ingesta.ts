import type { PrismaClient } from '@prisma/client';
import type { ICryptoService } from '../application/ports/crypto-service.port';
import type { IBlindIndexService } from '../application/ports/blind-index-service.port';
import type { ILogger } from '../application/ports/logger.port';

import { PreviewIngestaUseCase } from '../application/use-cases/preview-ingesta.use-case';
import { EjecutarPipelineIngestaUseCase } from '../application/use-cases/ejecutar-pipeline-ingesta.use-case';
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
import { PrismaAccountReader } from '../infrastructure/persistence/prisma-account-reader.repository';
import { PrismaTransaccionExistenteReader } from '../infrastructure/persistence/prisma-transaccion-existente.reader';
import { PrismaCatalogoClasificacionRepository } from '../infrastructure/persistence/prisma-catalogo-clasificacion.repository';

/**
 * crearPreviewIngesta — ensambla el grafo del seam de solo-lectura (US-057 PR2):
 *   EjecutarPipelineIngesta → IAccountReader → ITransaccionExistenteReader → ICatalogoClasificacion.
 *
 * US-057: preview now includes per-row dedup status (D-06/D-07) and classification
 * suggestions (D-09), so it needs read-only DB access. The guarantee that nothing
 * is persisted is still structural — `PrismaAccountReader` (no upsert),
 * `PrismaTransaccionExistenteReader` (SELECT only), and
 * `PrismaCatalogoClasificacionRepository` (findAll, read only) have no write branches.
 * Contrast with `crearProcessIngesta(prisma, crypto, blindIndex, logger)` which
 * injects `PrismaAccountRepository` (upsert) and `PrismaIngestaRepository` (create).
 *
 * D-17 (load-bearing): `PrismaTransaccionExistenteReader` receives `crypto` and
 * decrypts `descripcion` before returning — the natural-key comparison in
 * `marcarDuplicados` needs plaintext to match.
 *
 * ADR-033 slice B: `logger` is the SAME instance from `container.ts`.
 */
export function crearPreviewIngesta(
  prisma: PrismaClient,
  crypto: ICryptoService,
  blindIndex: IBlindIndexService,
  logger: ILogger,
): PreviewIngestaUseCase {
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

  return new PreviewIngestaUseCase(
    ejecutarPipelineUseCase,
    new PrismaAccountReader(prisma, blindIndex),
    new PrismaTransaccionExistenteReader(prisma, crypto),
    new PrismaCatalogoClasificacionRepository(prisma),
    logger,
  );
}
