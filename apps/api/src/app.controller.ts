import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './infrastructure/http/auth/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /**
   * Health check público — sin API key. Lo usa Render para verificar que el
   * servicio está vivo. No devuelve datos sensibles.
   */
  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
