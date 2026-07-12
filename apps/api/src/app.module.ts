import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './infrastructure/persistence/prisma.module';
import { IngestaModule } from './infrastructure/http/ingesta.module';
import { MovimientosModule } from './infrastructure/http/movimientos.module';
import { ResumenModule } from './infrastructure/http/resumen.module';

@Module({
  imports: [PrismaModule, IngestaModule, MovimientosModule, ResumenModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
