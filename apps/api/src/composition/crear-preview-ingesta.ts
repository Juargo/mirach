import type { ILogger } from '../application/ports/logger.port';

import { PreviewIngestaUseCase } from '../application/use-cases/preview-ingesta.use-case';
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

/**
 * crearPreviewIngesta — ensambla el grafo del seam de solo-lectura de US-003:
 * detectar → validar → normalizar (dual xlsx/pdf), SIN persistir.
 *
 * A propósito NO recibe `prisma` ni `crypto` (design §7.1): el eco a nivel de
 * composición de que este grafo no puede alcanzar la BD porque no tiene
 * dónde poner un handle de conexión. Contrasta con
 * `crearProcessIngesta(prisma, crypto)`. Un reviewer que ve
 * `crearPreviewIngesta(logger)` puede concluir "este camino no puede
 * escribir" sin leer el use case.
 *
 * ADR-033 slice B: `logger` se recibe ya construido — MISMA instancia única
 * de `container.ts` que recibe `crearProcessIngesta`, ver docstring ahí.
 */
export function crearPreviewIngesta(logger: ILogger): PreviewIngestaUseCase {
  return new PreviewIngestaUseCase(
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
}
