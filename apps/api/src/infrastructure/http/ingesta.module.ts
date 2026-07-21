import { Module } from '@nestjs/common';
import { IngestaController } from './ingesta.controller';
import { IngestFileUseCase } from '../../application/use-cases/ingest-file.use-case';
import { DetectBankUseCase } from '../../application/use-cases/detect-bank.use-case';
import { DetectPdfBankUseCase } from '../../application/use-cases/detect-pdf-bank.use-case';
import { ValidateStructureUseCase } from '../../application/use-cases/validate-structure.use-case';
import { ValidatePdfStructureUseCase } from '../../application/use-cases/validate-pdf-structure.use-case';
import { NormalizeTransactionsUseCase } from '../../application/use-cases/normalize-transactions.use-case';
import { NormalizePdfTransactionsUseCase } from '../../application/use-cases/normalize-pdf-transactions.use-case';
import { PersistTransactionsUseCase } from '../../application/use-cases/persist-transactions.use-case';
import { CategorizarTransaccionUseCase } from '../../application/use-cases/categorizar-transaccion.use-case';
import { ProcessIngestaUseCase } from '../../application/use-cases/process-ingesta.use-case';
import {
  ACCOUNT_REPOSITORY,
  IAccountRepository,
} from '../../application/ports/account-repository.port';
import {
  INGESTA_REPOSITORY,
  IIngestaRepository,
} from '../../application/ports/ingesta-repository.port';
import {
  CATALOGO_CLASIFICACION,
  ICatalogoClasificacion,
} from '../../application/ports/catalogo-clasificacion.port';
import {
  TRANSACCION_BUCKET_WRITER,
  ITransaccionBucketWriter,
} from '../../application/ports/transaccion-bucket-writer.port';
import {
  TRANSACCION_PARA_CLASIFICAR_READER,
  ITransaccionParaClasificarReader,
} from '../../application/ports/transaccion-para-clasificar.port';
import {
  TRANSACCION_EXISTENTE_READER,
  ITransaccionExistenteReader,
} from '../../application/ports/transaccion-existente-reader.port';
import { DetectarDuplicadosUseCase } from '../../application/use-cases/detectar-duplicados.use-case';
import { CRYPTO_SERVICE } from '../../application/ports/crypto-service.port';
import { ExcelBankDetectorService } from '../excel/excel-bank-detector.service';
import { ExcelStructureValidatorService } from '../excel/excel-structure-validator.service';
import { ExcelTransactionNormalizerService } from '../excel/excel-transaction-normalizer.service';
import { PdfjsBankDetectorService } from '../pdf/pdfjs-bank-detector.service';
import { PdfjsStructureValidatorService } from '../pdf/pdfjs-structure-validator.service';
import { PdfjsTransactionNormalizerService } from '../pdf/pdfjs-transaction-normalizer.service';
import { PrismaService } from '../persistence/prisma.service';
import { PrismaAccountRepository } from '../persistence/prisma-account.repository';
import { PrismaIngestaRepository } from '../persistence/prisma-ingesta.repository';
import { PrismaTransaccionExistenteReader } from '../persistence/prisma-transaccion-existente.reader';
import { PrismaCatalogoClasificacionRepository } from '../persistence/prisma-catalogo-clasificacion.repository';
import { PrismaTransaccionBucketRepository } from '../persistence/prisma-transaccion-bucket.repository';
import { PrismaTransaccionClasificacionRepository } from '../persistence/prisma-transaccion-clasificacion.repository';
import { NoOpCryptoService } from '../persistence/no-op-crypto.service';

/**
 * IngestaModule — módulo NestJS para la épica de Ingesta de Datos.
 *
 * Actúa como Composition Root: registra los adapters Prisma/Excel detrás de
 * los tokens de los ports de application, y compone los use cases (incluido
 * el orquestador ProcessIngestaUseCase) como providers. IngestaController
 * inyecta ProcessIngestaUseCase — el mismo orquestador que usa el CLI —, así
 * que CLI y HTTP corren genuinamente el mismo pipeline.
 *
 * Los adapters (repos Prisma, NoOpCryptoService, use cases) son clases planas
 * sin decoradores — se registran vía `useFactory` para mantener el dominio y
 * application libres de dependencias de NestJS (regla de dependencias del
 * proyecto: domain ← application ← infrastructure).
 */
@Module({
  controllers: [IngestaController],
  providers: [
    { provide: CRYPTO_SERVICE, useClass: NoOpCryptoService },
    {
      provide: ACCOUNT_REPOSITORY,
      useFactory: (prisma: PrismaService) =>
        new PrismaAccountRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: INGESTA_REPOSITORY,
      useFactory: (prisma: PrismaService, crypto: NoOpCryptoService) =>
        new PrismaIngestaRepository(prisma, crypto),
      inject: [PrismaService, CRYPTO_SERVICE],
    },
    {
      provide: CATALOGO_CLASIFICACION,
      useFactory: (prisma: PrismaService) =>
        new PrismaCatalogoClasificacionRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: TRANSACCION_BUCKET_WRITER,
      useFactory: (prisma: PrismaService) =>
        new PrismaTransaccionBucketRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: TRANSACCION_PARA_CLASIFICAR_READER,
      useFactory: (prisma: PrismaService) =>
        new PrismaTransaccionClasificacionRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: TRANSACCION_EXISTENTE_READER,
      useFactory: (prisma: PrismaService, crypto: NoOpCryptoService) =>
        new PrismaTransaccionExistenteReader(prisma, crypto),
      inject: [PrismaService, CRYPTO_SERVICE],
    },
    {
      provide: DetectarDuplicadosUseCase,
      useFactory: (reader: ITransaccionExistenteReader) =>
        new DetectarDuplicadosUseCase(reader),
      inject: [TRANSACCION_EXISTENTE_READER],
    },
    IngestFileUseCase,
    CategorizarTransaccionUseCase,
    {
      provide: DetectBankUseCase,
      useFactory: () => new DetectBankUseCase(new ExcelBankDetectorService()),
    },
    {
      provide: DetectPdfBankUseCase,
      useFactory: () =>
        new DetectPdfBankUseCase(new PdfjsBankDetectorService()),
    },
    {
      provide: ValidateStructureUseCase,
      useFactory: () =>
        new ValidateStructureUseCase(new ExcelStructureValidatorService()),
    },
    {
      provide: ValidatePdfStructureUseCase,
      useFactory: () =>
        new ValidatePdfStructureUseCase(new PdfjsStructureValidatorService()),
    },
    {
      provide: NormalizeTransactionsUseCase,
      useFactory: () =>
        new NormalizeTransactionsUseCase(
          new ExcelTransactionNormalizerService(),
        ),
    },
    {
      provide: NormalizePdfTransactionsUseCase,
      useFactory: () =>
        new NormalizePdfTransactionsUseCase(
          new PdfjsTransactionNormalizerService(),
        ),
    },
    {
      provide: PersistTransactionsUseCase,
      useFactory: (ingestaRepository: IIngestaRepository) =>
        new PersistTransactionsUseCase(ingestaRepository),
      inject: [INGESTA_REPOSITORY],
    },
    {
      provide: ProcessIngestaUseCase,
      useFactory: (
        ingestFileUseCase: IngestFileUseCase,
        detectBankUseCase: DetectBankUseCase,
        detectPdfBankUseCase: DetectPdfBankUseCase,
        accountRepository: IAccountRepository,
        validateStructureUseCase: ValidateStructureUseCase,
        validatePdfStructureUseCase: ValidatePdfStructureUseCase,
        normalizeTransactionsUseCase: NormalizeTransactionsUseCase,
        normalizePdfTransactionsUseCase: NormalizePdfTransactionsUseCase,
        persistTransactionsUseCase: PersistTransactionsUseCase,
        catalogoClasificacion: ICatalogoClasificacion,
        transaccionBucketWriter: ITransaccionBucketWriter,
        categorizarTransaccionUseCase: CategorizarTransaccionUseCase,
        txParaClasificarReader: ITransaccionParaClasificarReader,
        detectarDuplicadosUseCase: DetectarDuplicadosUseCase,
      ) =>
        new ProcessIngestaUseCase(
          ingestFileUseCase,
          detectBankUseCase,
          detectPdfBankUseCase,
          accountRepository,
          validateStructureUseCase,
          validatePdfStructureUseCase,
          normalizeTransactionsUseCase,
          normalizePdfTransactionsUseCase,
          persistTransactionsUseCase,
          catalogoClasificacion,
          transaccionBucketWriter,
          categorizarTransaccionUseCase,
          txParaClasificarReader,
          detectarDuplicadosUseCase,
        ),
      inject: [
        IngestFileUseCase,
        DetectBankUseCase,
        DetectPdfBankUseCase,
        ACCOUNT_REPOSITORY,
        ValidateStructureUseCase,
        ValidatePdfStructureUseCase,
        NormalizeTransactionsUseCase,
        NormalizePdfTransactionsUseCase,
        PersistTransactionsUseCase,
        CATALOGO_CLASIFICACION,
        TRANSACCION_BUCKET_WRITER,
        CategorizarTransaccionUseCase,
        TRANSACCION_PARA_CLASIFICAR_READER,
        DetectarDuplicadosUseCase,
      ],
    },
  ],
})
export class IngestaModule {}
