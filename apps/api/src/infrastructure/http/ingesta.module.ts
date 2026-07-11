import { Module } from '@nestjs/common';
import { IngestaController } from './ingesta.controller';
import { IngestFileUseCase } from '../../application/use-cases/ingest-file.use-case';
import { DetectBankUseCase } from '../../application/use-cases/detect-bank.use-case';
import { ValidateStructureUseCase } from '../../application/use-cases/validate-structure.use-case';
import { NormalizeTransactionsUseCase } from '../../application/use-cases/normalize-transactions.use-case';
import { PersistTransactionsUseCase } from '../../application/use-cases/persist-transactions.use-case';
import { ProcessIngestaUseCase } from '../../application/use-cases/process-ingesta.use-case';
import { ACCOUNT_REPOSITORY, IAccountRepository } from '../../application/ports/account-repository.port';
import { INGESTA_REPOSITORY, IIngestaRepository } from '../../application/ports/ingesta-repository.port';
import { CRYPTO_SERVICE } from '../../application/ports/crypto-service.port';
import { ExcelBankDetectorService } from '../excel/excel-bank-detector.service';
import { ExcelStructureValidatorService } from '../excel/excel-structure-validator.service';
import { ExcelTransactionNormalizerService } from '../excel/excel-transaction-normalizer.service';
import { PrismaService } from '../persistence/prisma.service';
import { PrismaAccountRepository } from '../persistence/prisma-account.repository';
import { PrismaIngestaRepository } from '../persistence/prisma-ingesta.repository';
import { NoOpCryptoService } from '../persistence/no-op-crypto.service';

/**
 * IngestaModule — módulo NestJS para la épica de Ingesta de Datos.
 *
 * Actúa como Composition Root: registra los adapters Prisma/Excel detrás de
 * los tokens de los ports de application, y compone los use cases (incluido
 * el orquestador ProcessIngestaUseCase) como providers. IngestaController
 * TODAVÍA no consume ProcessIngestaUseCase (solo inyecta IngestFileUseCase);
 * queda registrado aquí para que la siguiente porción (PR4) solo tenga que
 * cablear el controller, sin tocar este módulo.
 *
 * Los adapters (repos Prisma, NoOpCryptoService, use cases) son clases planas
 * sin decoradores — se registran vía `useFactory` para mantener el dominio y
 * application libres de dependencias de NestJS (regla de dependencias del
 * proyecto: domain ← application ← infrastructure).
 */
@Module({
  controllers: [IngestaController],
  providers: [
    PrismaService,
    { provide: CRYPTO_SERVICE, useClass: NoOpCryptoService },
    {
      provide: ACCOUNT_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaAccountRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: INGESTA_REPOSITORY,
      useFactory: (prisma: PrismaService, crypto: NoOpCryptoService) =>
        new PrismaIngestaRepository(prisma, crypto),
      inject: [PrismaService, CRYPTO_SERVICE],
    },
    IngestFileUseCase,
    {
      provide: DetectBankUseCase,
      useFactory: () => new DetectBankUseCase(new ExcelBankDetectorService()),
    },
    {
      provide: ValidateStructureUseCase,
      useFactory: () => new ValidateStructureUseCase(new ExcelStructureValidatorService()),
    },
    {
      provide: NormalizeTransactionsUseCase,
      useFactory: () => new NormalizeTransactionsUseCase(new ExcelTransactionNormalizerService()),
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
        accountRepository: IAccountRepository,
        validateStructureUseCase: ValidateStructureUseCase,
        normalizeTransactionsUseCase: NormalizeTransactionsUseCase,
        persistTransactionsUseCase: PersistTransactionsUseCase,
      ) =>
        new ProcessIngestaUseCase(
          ingestFileUseCase,
          detectBankUseCase,
          accountRepository,
          validateStructureUseCase,
          normalizeTransactionsUseCase,
          persistTransactionsUseCase,
        ),
      inject: [
        IngestFileUseCase,
        DetectBankUseCase,
        ACCOUNT_REPOSITORY,
        ValidateStructureUseCase,
        NormalizeTransactionsUseCase,
        PersistTransactionsUseCase,
      ],
    },
  ],
})
export class IngestaModule {}
