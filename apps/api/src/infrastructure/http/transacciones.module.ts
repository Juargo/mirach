import { Module } from '@nestjs/common';
import { TransaccionesController } from './transacciones.controller';
import { ReclasificarTransaccionUseCase } from '../../application/use-cases/reclasificar-transaccion.use-case';
import {
  RECLASIFICAR_CATEGORIA_WRITER,
  IReclasificarCategoriaWriter,
} from '../../application/ports/reclasificar-categoria.port';
import { PrismaReclasificarCategoriaRepository } from '../persistence/prisma-reclasificar-categoria.repository';
import { PrismaService } from '../persistence/prisma.service';

/**
 * TransaccionesModule — NestJS module for the manual reclassify endpoint (US-013 S4).
 *
 * Mirrors DetalleBucketModule layer-for-layer (composition root with useFactory).
 * Use cases and adapters have no NestJS decorators — ADR-005.
 *
 * NOTE: Does NOT import PrismaModule and does NOT declare its own PrismaService
 * provider. PrismaModule is @Global — PrismaService is injectable everywhere
 * without explicit import.
 */
@Module({
  controllers: [TransaccionesController],
  providers: [
    {
      provide: RECLASIFICAR_CATEGORIA_WRITER,
      useFactory: (prisma: PrismaService) =>
        new PrismaReclasificarCategoriaRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: ReclasificarTransaccionUseCase,
      useFactory: (writer: IReclasificarCategoriaWriter) =>
        new ReclasificarTransaccionUseCase(writer),
      inject: [RECLASIFICAR_CATEGORIA_WRITER],
    },
  ],
})
export class TransaccionesModule {}
