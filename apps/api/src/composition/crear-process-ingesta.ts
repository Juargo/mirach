import type { PrismaClient } from '@prisma/client';

import { ProcessIngestaUseCase } from '../application/use-cases/process-ingesta.use-case';
import { IngestFileUseCase } from '../application/use-cases/ingest-file.use-case';
import { DetectBankUseCase } from '../application/use-cases/detect-bank.use-case';
import { DetectPdfBankUseCase } from '../application/use-cases/detect-pdf-bank.use-case';
import { ValidateStructureUseCase } from '../application/use-cases/validate-structure.use-case';
import { ValidatePdfStructureUseCase } from '../application/use-cases/validate-pdf-structure.use-case';
import { NormalizeTransactionsUseCase } from '../application/use-cases/normalize-transactions.use-case';
import { NormalizePdfTransactionsUseCase } from '../application/use-cases/normalize-pdf-transactions.use-case';
import { PersistTransactionsUseCase } from '../application/use-cases/persist-transactions.use-case';
import { CategorizarTransaccionUseCase } from '../application/use-cases/categorizar-transaccion.use-case';
import { DetectarDuplicadosUseCase } from '../application/use-cases/detectar-duplicados.use-case';

import { ExcelBankDetectorService } from '../infrastructure/excel/excel-bank-detector.service';
import { ExcelStructureValidatorService } from '../infrastructure/excel/excel-structure-validator.service';
import { ExcelTransactionNormalizerService } from '../infrastructure/excel/excel-transaction-normalizer.service';
import { PdfjsBankDetectorService } from '../infrastructure/pdf/pdfjs-bank-detector.service';
import { PdfjsStructureValidatorService } from '../infrastructure/pdf/pdfjs-structure-validator.service';
import { PdfjsTransactionNormalizerService } from '../infrastructure/pdf/pdfjs-transaction-normalizer.service';

import { NoOpCryptoService } from '../infrastructure/persistence/no-op-crypto.service';
import { PrismaAccountRepository } from '../infrastructure/persistence/prisma-account.repository';
import { PrismaIngestaRepository } from '../infrastructure/persistence/prisma-ingesta.repository';
import { PrismaCatalogoClasificacionRepository } from '../infrastructure/persistence/prisma-catalogo-clasificacion.repository';
import { PrismaTransaccionBucketRepository } from '../infrastructure/persistence/prisma-transaccion-bucket.repository';
import { PrismaTransaccionClasificacionRepository } from '../infrastructure/persistence/prisma-transaccion-clasificacion.repository';
import { PrismaTransaccionExistenteReader } from '../infrastructure/persistence/prisma-transaccion-existente.reader';

/**
 * crearProcessIngesta — ensambla el pipeline completo de ingesta
 * (detectar → asegurar cuenta → validar → normalizar → persistir → categorizar),
 * dual xlsx/pdf. Réplica exacta del wiring que hacía `IngestaModule` (Nest),
 * extraído a un helper para que el composition root de Express (container.ts) y,
 * tras el cutover, el CLI compartan el mismo grafo sin duplicarlo.
 *
 * El orden de argumentos de `ProcessIngestaUseCase` es significativo — se
 * mantiene idéntico al del módulo Nest original.
 */
export function crearProcessIngesta(prisma: PrismaClient): ProcessIngestaUseCase {
  const crypto = new NoOpCryptoService();

  const accountRepository = new PrismaAccountRepository(prisma);
  const ingestaRepository = new PrismaIngestaRepository(prisma, crypto);
  const catalogoClasificacion = new PrismaCatalogoClasificacionRepository(prisma);
  const transaccionBucketWriter = new PrismaTransaccionBucketRepository(prisma);
  const txParaClasificarReader = new PrismaTransaccionClasificacionRepository(prisma);
  const txExistenteReader = new PrismaTransaccionExistenteReader(prisma, crypto);

  return new ProcessIngestaUseCase(
    new IngestFileUseCase(),
    new DetectBankUseCase(new ExcelBankDetectorService()),
    new DetectPdfBankUseCase(new PdfjsBankDetectorService()),
    accountRepository,
    new ValidateStructureUseCase(new ExcelStructureValidatorService()),
    new ValidatePdfStructureUseCase(new PdfjsStructureValidatorService()),
    new NormalizeTransactionsUseCase(new ExcelTransactionNormalizerService()),
    new NormalizePdfTransactionsUseCase(new PdfjsTransactionNormalizerService()),
    new PersistTransactionsUseCase(ingestaRepository),
    catalogoClasificacion,
    transaccionBucketWriter,
    new CategorizarTransaccionUseCase(),
    txParaClasificarReader,
    new DetectarDuplicadosUseCase(txExistenteReader),
  );
}
