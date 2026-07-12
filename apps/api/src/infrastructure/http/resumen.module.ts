import { Module } from '@nestjs/common';
import { ResumenController } from './resumen.controller';
import { CalcularResumenMesUseCase } from '../../application/use-cases/calcular-resumen-mes.use-case';
import {
  RESUMEN_MES_READER,
  IResumenMesReader,
} from '../../application/ports/resumen-mes.port';
import { PrismaResumenMesRepository } from '../persistence/prisma-resumen-mes.repository';
import { PrismaService } from '../persistence/prisma.service';
import { USER_ID_FIJO, USER_ID_FIJO_TOKEN } from '../persistence/constants';

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
      provide: USER_ID_FIJO_TOKEN,
      useValue: USER_ID_FIJO,
    },
  ],
})
export class ResumenModule {}
