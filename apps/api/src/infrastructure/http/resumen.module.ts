import { Module } from '@nestjs/common';
import { ResumenController } from './resumen.controller';
import { CalcularResumenMesUseCase } from '../../application/use-cases/calcular-resumen-mes.use-case';
import { CalcularResumenAnualUseCase } from '../../application/use-cases/calcular-resumen-anual.use-case';
import {
  RESUMEN_MES_READER,
  IResumenMesReader,
} from '../../application/ports/resumen-mes.port';
import {
  RESUMEN_ANUAL_READER,
  IResumenAnualReader,
} from '../../application/ports/resumen-anual.port';
import { PrismaResumenMesRepository } from '../persistence/prisma-resumen-mes.repository';
import { PrismaResumenAnualRepository } from '../persistence/prisma-resumen-anual.repository';
import { PrismaService } from '../persistence/prisma.service';

/**
 * ResumenModule — NestJS module for the 50/30/20 monthly breakdown (US-015).
 *
 * Mirrors MovimientosModule layer-for-layer (composition root with useFactory).
 * Use cases and adapters have no NestJS decorators — ADR-005.
 *
 * NOTE: Does NOT import PrismaModule and does NOT declare its own PrismaService
 * provider. PrismaModule is @Global — PrismaService is injectable everywhere
 * without explicit import.
 */
@Module({
  controllers: [ResumenController],
  providers: [
    {
      provide: RESUMEN_MES_READER,
      useFactory: (prisma: PrismaService) =>
        new PrismaResumenMesRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: CalcularResumenMesUseCase,
      useFactory: (reader: IResumenMesReader) =>
        new CalcularResumenMesUseCase(reader),
      inject: [RESUMEN_MES_READER],
    },
    {
      provide: RESUMEN_ANUAL_READER,
      useFactory: (prisma: PrismaService) =>
        new PrismaResumenAnualRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: CalcularResumenAnualUseCase,
      useFactory: (reader: IResumenAnualReader) =>
        new CalcularResumenAnualUseCase(reader),
      inject: [RESUMEN_ANUAL_READER],
    },
  ],
})
export class ResumenModule {}
