import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Confía en el primer hop del proxy (Render/Vercel) para que `req.ip`
  // resuelva correctamente `x-forwarded-for` — getClientIp (design.md §1)
  // LEE `request.ip`, no el header crudo, así que este ajuste es lo único
  // que hace que el rate limiter por-IP no sea trivialmente falsificable
  // por un header `x-forwarded-for` agregado por el propio cliente.
  app.set('trust proxy', 1);
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
