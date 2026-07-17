import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './infrastructure/persistence/prisma.module';
import { IngestaModule } from './infrastructure/http/ingesta.module';
import { MovimientosModule } from './infrastructure/http/movimientos.module';
import { ResumenModule } from './infrastructure/http/resumen.module';
import { DetalleBucketModule } from './infrastructure/http/detalle-bucket.module';
import { ApiKeyGuard } from './infrastructure/http/auth/api-key.guard';

@Module({
  imports: [
    PrismaModule,
    IngestaModule,
    MovimientosModule,
    ResumenModule,
    DetalleBucketModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Guard global fail-closed: exige x-api-key en todos los endpoints salvo
    // los marcados @Public(). Protege los datos financieros al exponer la API.
    { provide: APP_GUARD, useClass: ApiKeyGuard },
  ],
})
export class AppModule {}
