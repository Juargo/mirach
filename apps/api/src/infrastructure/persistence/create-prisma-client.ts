import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * createPrismaClient — factory de un PrismaClient plano (ADR-028).
 *
 * Reemplaza el `PrismaService` (@Injectable) de Nest: misma lógica de conexión
 * (driver adapter `@prisma/adapter-pg`, cadena `DIRECT_URL ?? DATABASE_URL`),
 * pero SIN las lifecycle hooks de Nest. El ciclo de vida ($connect/$disconnect)
 * lo maneja el composition root (container.ts) / el bootstrap.
 *
 * Es infraestructura: negarse a arrancar sin cadena de conexión es aceptable
 * (la regla de no lanzar aplica solo a dominio/application).
 */
export function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'createPrismaClient requiere DATABASE_URL o DIRECT_URL definido en el entorno.',
    );
  }
  const adapter = new PrismaPg(connectionString);
  return new PrismaClient({ adapter });
}
