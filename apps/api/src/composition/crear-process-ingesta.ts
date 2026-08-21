import type { PrismaClient } from '@prisma/client';
import type { ICryptoService } from '../application/ports/crypto-service.port';
import type { IBlindIndexService } from '../application/ports/blind-index-service.port';
import type { ILogger } from '../application/ports/logger.port';

import { ProcessIngestaUseCase } from '../application/use-cases/process-ingesta.use-case';
import { EjecutarPipelineIngestaUseCase } from '../application/use-cases/ejecutar-pipeline-ingesta.use-case';
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

import { PrismaAccountRepository } from '../infrastructure/persistence/prisma-account.repository';
import { PrismaIngestaRepository } from '../infrastructure/persistence/prisma-ingesta.repository';
import { PrismaRegistrarIngestaFallidaRepository } from '../infrastructure/persistence/prisma-registrar-ingesta-fallida.repository';
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
 *
 * Cifrado (ADR-013): `crypto` se recibe ya construido (no se instancia acá)
 * — el caller (`container.ts` / `ingestar.ts`) es dueño de decodificar
 * `env.ENCRYPTION_KEY` UNA sola vez y pasar la MISMA instancia a este helper
 * y a los readers de movimientos/detalle-bucket, para que el ciphertext que
 * escribe la ingesta descifre con la clave que usan esos lectores.
 *
 * US-035 Slice 2: `blindIndex` se recibe igual de ya-construido — lo usa
 * `PrismaAccountRepository.ensure` para buscar/crear la cuenta por
 * `numeroCuentaBlindIndex` en vez de por `numeroCuenta` en claro (ver
 * docstring de esa clase). MISMA instancia que `crearAuth` (derivada del
 * mismo `ENCRYPTION_KEY`, ver `derive-blind-index-key.ts`).
 *
 * ADR-033 slice 2: `logger` se recibe ya construido — `container.ts` es
 * dueño de crear la ÚNICA instancia de `PinoLogger` del composition root
 * (pretty/JSON decidido por `env.NODE_ENV`) y la inyecta acá, igual que
 * `crypto`/`blindIndex`.
 */
export function crearProcessIngesta(
  prisma: PrismaClient,
  crypto: ICryptoService,
  blindIndex: IBlindIndexService,
  logger: ILogger,
): ProcessIngestaUseCase {
  const accountRepository = new PrismaAccountRepository(
    prisma,
    crypto,
    blindIndex,
  );
  const ingestaRepository = new PrismaIngestaRepository(prisma, crypto);
  const ingestaFallidaWriter = new PrismaRegistrarIngestaFallidaRepository(
    prisma,
  );
  const catalogoClasificacion = new PrismaCatalogoClasificacionRepository(
    prisma,
  );
  const transaccionBucketWriter = new PrismaTransaccionBucketRepository(prisma);
  const txParaClasificarReader = new PrismaTransaccionClasificacionRepository(
    prisma,
    crypto,
  );
  const txExistenteReader = new PrismaTransaccionExistenteReader(
    prisma,
    crypto,
  );

  // US-057 D-01: wrap the 7 individual front-pipeline UCs into the shared
  // EjecutarPipelineIngestaUseCase before passing to ProcessIngestaUseCase.
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

  return new ProcessIngestaUseCase(
    ejecutarPipelineUseCase,
    accountRepository,
    new PersistTransactionsUseCase(ingestaRepository, logger),
    catalogoClasificacion,
    transaccionBucketWriter,
    new CategorizarTransaccionUseCase(logger),
    txParaClasificarReader,
    new DetectarDuplicadosUseCase(txExistenteReader, logger),
    ingestaFallidaWriter,
    logger,
  );
}
