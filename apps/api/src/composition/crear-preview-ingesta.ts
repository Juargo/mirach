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
 * A propósito NO recibe argumentos — ni `prisma` ni `crypto` (design §7.1):
 * el eco a nivel de composición de que este grafo no puede alcanzar la BD
 * porque no tiene dónde poner un handle de conexión. Contrasta con
 * `crearProcessIngesta(prisma, crypto)`. Un reviewer que ve
 * `crearPreviewIngesta()` con parámetros vacíos puede concluir "este camino
 * no puede escribir" sin leer el use case.
 */
export function crearPreviewIngesta(): PreviewIngestaUseCase {
  return new PreviewIngestaUseCase(
    new IngestFileUseCase(),
    new DetectBankUseCase(new ExcelBankDetectorService()),
    new DetectPdfBankUseCase(new PdfjsBankDetectorService()),
    new ValidateStructureUseCase(new ExcelStructureValidatorService()),
    new ValidatePdfStructureUseCase(new PdfjsStructureValidatorService()),
    new NormalizeTransactionsUseCase(new ExcelTransactionNormalizerService()),
    new NormalizePdfTransactionsUseCase(
      new PdfjsTransactionNormalizerService(),
    ),
  );
}
