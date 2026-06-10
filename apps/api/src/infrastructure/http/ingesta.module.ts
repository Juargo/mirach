import { Module } from '@nestjs/common';
import { IngestaController } from './ingesta.controller';
import { IngestFileUseCase } from '../../application/use-cases/ingest-file.use-case';

/**
 * IngestaModule — módulo NestJS para la épica de Ingesta de Datos.
 *
 * Actúa como Composition Root parcial:
 * registra el use case como provider e inyecta sus dependencias.
 */
@Module({
  controllers: [IngestaController],
  providers: [IngestFileUseCase],
})
export class IngestaModule {}
