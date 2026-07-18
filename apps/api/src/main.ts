import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Confía en el primer hop del proxy (Render/Vercel) para que req.ip sea
  // correcto — defensa en profundidad junto a obtenerIpCliente, que lee
  // x-forwarded-for directamente (design.md §1).
  app.set('trust proxy', 1);
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
