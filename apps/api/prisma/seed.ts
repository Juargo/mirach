import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  USER_ID_FIJO,
  ACCOUNT_ID_FIJO,
} from '../src/infrastructure/persistence/constants';
import { assertDestructiveDbAllowed } from '../src/infrastructure/persistence/db-safety';

/**
 * Seed mono-usuario (US-011, tareas 0.1-0.3).
 *
 * Modo mono-usuario: el MVP opera con UN usuario fijo (USER_ID_FIJO) y una
 * cuenta semilla fija (ACCOUNT_ID_FIJO). Las cuentas reales por banco se crean
 * en tiempo de ingesta vía IAccountRepository.ensure; esta cuenta semilla solo
 * garantiza un estado inicial consistente. El seed es idempotente (upsert por
 * id fijo): correrlo N veces produce exactamente un User y un Account.
 */

/** Datos de la cuenta semilla (placeholder del modo mono-usuario). */
export const SEED_ACCOUNT = {
  banco: 'BancoEstado',
  tipoCuenta: 'Cuenta Corriente',
  numeroCuenta: '000000000',
} as const;

/** Cliente mínimo requerido por el seed (facilita el test de idempotencia). */
type SeedClient = Pick<PrismaClient, 'user' | 'account'>;

export async function runSeed(prisma: SeedClient): Promise<void> {
  await prisma.user.upsert({
    where: { id: USER_ID_FIJO },
    create: { id: USER_ID_FIJO, nombre: 'Usuario MoneyDiary' },
    update: {},
  });

  await prisma.account.upsert({
    where: { id: ACCOUNT_ID_FIJO },
    create: { id: ACCOUNT_ID_FIJO, userId: USER_ID_FIJO, ...SEED_ACCOUNT },
    update: {},
  });
}

async function main(): Promise<void> {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('seed requiere DATABASE_URL o DIRECT_URL en el entorno.');
  }
  // El seed muta la BD: exige opt-in explícito y rechaza cadenas de producción.
  assertDestructiveDbAllowed({ connectionString });
  const prisma = new PrismaClient({ adapter: new PrismaPg(connectionString) });
  try {
    await runSeed(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecuta solo como script (prisma db seed / ts-node), no al importarse en tests.
if (require.main === module) {
  main()
    .then(() => {
      console.log('Seed completado.');
    })
    .catch((error) => {
      console.error('Seed falló:', error);
      process.exitCode = 1;
    });
}
