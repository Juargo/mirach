import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { IngestaModule } from './infrastructure/http/ingesta.module';

@Module({
  imports: [IngestaModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
