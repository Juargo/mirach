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
import { AuthModule } from './infrastructure/http/auth/auth.module';
import { SessionGuard } from './infrastructure/http/auth/session.guard';

@Module({
  imports: [
    PrismaModule,
    IngestaModule,
    MovimientosModule,
    ResumenModule,
    DetalleBucketModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Dos guards globales, en orden (AC-06 — el orden de registro importa):
    //   1. ApiKeyGuard  — exige x-api-key salvo @Public(). Protege el acceso
    //      a nivel de app (admisión, no identidad).
    //   2. SessionGuard — exige una sesión válida (cookie o Bearer) salvo
    //      @Public() o @PublicSession(). Identidad real del usuario.
    { provide: APP_GUARD, useClass: ApiKeyGuard },
    { provide: APP_GUARD, useExisting: SessionGuard },
  ],
})
export class AppModule {}
