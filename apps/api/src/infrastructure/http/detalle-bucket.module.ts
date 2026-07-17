import { Module } from '@nestjs/common';
import { DetalleBucketController } from './detalle-bucket.controller';
import { ObtenerDetalleBucketUseCase } from '../../application/use-cases/obtener-detalle-bucket.use-case';
import {
  DETALLE_BUCKET_READER,
  IDetalleBucketReader,
} from '../../application/ports/detalle-bucket.port';
import { PrismaDetalleBucketRepository } from '../persistence/prisma-detalle-bucket.repository';
import { PrismaService } from '../persistence/prisma.service';
import { USER_ID_FIJO, USER_ID_FIJO_TOKEN } from '../persistence/constants';

/**
 * DetalleBucketModule — NestJS module for the bucket-detail drill-down (US-017).
 *
 * Mirrors ResumenModule layer-for-layer (composition root with useFactory).
 * Use cases and adapters have no NestJS decorators — ADR-005.
 *
 * NOTE: Does NOT import PrismaModule and does NOT declare its own PrismaService
 * provider. PrismaModule is @Global — PrismaService is injectable everywhere
 * without explicit import.
 */
@Module({
  controllers: [DetalleBucketController],
  providers: [
    {
      provide: DETALLE_BUCKET_READER,
      useFactory: (prisma: PrismaService) =>
        new PrismaDetalleBucketRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: ObtenerDetalleBucketUseCase,
      useFactory: (reader: IDetalleBucketReader) =>
        new ObtenerDetalleBucketUseCase(reader),
      inject: [DETALLE_BUCKET_READER],
    },
    {
      provide: USER_ID_FIJO_TOKEN,
      useValue: USER_ID_FIJO,
    },
  ],
})
export class DetalleBucketModule {}
