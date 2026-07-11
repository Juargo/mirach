import { Module } from '@nestjs/common';
import { MovimientosController } from './movimientos.controller';
import { ObtenerMovimientosMesUseCase } from '../../application/use-cases/obtener-movimientos-mes.use-case';
import {
  MOVIMIENTOS_MES_READER,
  IMovimientosMesReader,
} from '../../application/ports/movimientos-mes.port';
import { PrismaMovimientosMesRepository } from '../persistence/prisma-movimientos-mes.repository';
import { PrismaService } from '../persistence/prisma.service';
import { USER_ID_FIJO, USER_ID_FIJO_TOKEN } from '../persistence/constants';

/**
 * MovimientosModule — módulo NestJS para la consulta mensual consolidada (US-014).
 *
 * Módulo independiente de IngestaModule: la lectura es una preocupación separada
 * con un grafo de ports distinto al pipeline de escritura (ADR-005 / DECISION 5).
 *
 * Composition root con useFactory: los use cases y adapters no tienen decoradores
 * NestJS, respetando la regla domain ← application ← infrastructure.
 */
@Module({
  controllers: [MovimientosController],
  providers: [
    {
      provide: MOVIMIENTOS_MES_READER,
      useFactory: (prisma: PrismaService) => new PrismaMovimientosMesRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: ObtenerMovimientosMesUseCase,
      useFactory: (reader: IMovimientosMesReader) =>
        new ObtenerMovimientosMesUseCase(reader),
      inject: [MOVIMIENTOS_MES_READER],
    },
    {
      provide: USER_ID_FIJO_TOKEN,
      useValue: USER_ID_FIJO,
    },
  ],
})
export class MovimientosModule {}
