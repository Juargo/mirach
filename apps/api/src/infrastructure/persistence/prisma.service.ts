import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * PrismaService — cliente Prisma gestionado por NestJS.
 *
 * Usa el driver adapter `@prisma/adapter-pg` (Prisma 7 + pooler de Supabase).
 * La cadena de conexión se resuelve como DIRECT_URL ?? DATABASE_URL, igual
 * que en prisma.config.ts. Las lifecycle hooks abren/cierran la conexión
 * con el ciclo de vida del módulo.
 *
 * Es infraestructura: lanzar por configuración ausente es aceptable aquí
 * (la regla de no lanzar aplica solo a dominio/application).
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        'PrismaService requiere DATABASE_URL o DIRECT_URL definido en el entorno.',
      );
    }
    const adapter = new PrismaPg(connectionString);
    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
