import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

import { resolveConnectionString, type Env } from '../../config/env';

/**
 * createPrismaClient — factory de un PrismaClient plano (ADR-028/029).
 *
 * Reemplaza el `PrismaService` (@Injectable) de Nest: misma lógica de conexión
 * (driver adapter `@prisma/adapter-pg`, cadena `DIRECT_URL ?? DATABASE_URL`),
 * pero SIN las lifecycle hooks de Nest. El ciclo de vida ($connect/$disconnect)
 * lo maneja el composition root (container.ts) / el bootstrap.
 *
 * ADR-029: recibe `env` inyectado en vez de leer `process.env` directamente —
 * el único read point de `DATABASE_URL`/`DIRECT_URL` es `loadEnv()` en
 * server.ts. `resolveConnectionString` es la fuente única de la precedencia
 * `DIRECT_URL ?? DATABASE_URL` (compartida con el `superRefine` de env.ts).
 *
 * Es infraestructura: negarse a arrancar sin cadena de conexión es aceptable
 * (la regla de no lanzar aplica solo a dominio/application).
 */
export function createPrismaClient(
  env: Pick<Env, 'DATABASE_URL' | 'DIRECT_URL'>,
): PrismaClient {
  const connectionString = resolveConnectionString(env);
  if (!connectionString) {
    throw new Error(
      'createPrismaClient requiere DATABASE_URL o DIRECT_URL definido en el entorno.',
    );
  }
  const adapter = new PrismaPg(connectionString);
  return new PrismaClient({ adapter });
}
