import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  USER_ID_FIJO,
  ACCOUNT_ID_FIJO,
} from '../src/infrastructure/persistence/constants';
import { BUCKET_IDS } from '../src/infrastructure/persistence/bucket-ids';
import { Bucket } from '../src/domain/value-objects/bucket';
import { assertDestructiveDbAllowed } from '../src/infrastructure/persistence/db-safety';

/**
 * Seed mono-usuario (US-011, tareas 0.1-0.3) + Buckets de categorización (US-012).
 *
 * Modo mono-usuario: el MVP opera con UN usuario fijo (USER_ID_FIJO) y una
 * cuenta semilla fija (ACCOUNT_ID_FIJO). Las cuentas reales por banco se crean
 * en tiempo de ingesta vía IAccountRepository.ensure; esta cuenta semilla solo
 * garantiza un estado inicial consistente. El seed es idempotente (upsert por
 * id fijo): correrlo N veces produce exactamente un User, un Account, 5
 * BucketPresupuesto y sin duplicados en PatronClasificacion.
 */

/** Datos de la cuenta semilla (placeholder del modo mono-usuario). */
export const SEED_ACCOUNT = {
  banco: 'BancoEstado',
  tipoCuenta: 'Cuenta Corriente',
  numeroCuenta: '000000000',
} as const;

/** Cliente mínimo requerido por el seed (facilita el test de idempotencia). */
type SeedClient = Pick<PrismaClient, 'user' | 'account' | 'bucketPresupuesto' | 'patronClasificacion'>;

// ── US-012: Catálogo de patrones chilenos (module-level so PATRON_CATALOG_SIZE derives from it) ──
// Prefer CONTAINS (sin superficie ReDoS). REGEX solo para casos que lo requieren
// explícitamente — siempre anclado/acotado. Todos los ids son fijos (idempotencia).
// prioridad: valor más bajo = más prioritario. Dentro de la misma prioridad, el
// tiebreak es por id lexicográfico.
const PATRON_CATALOG: Array<{
  id: string;
  patron: string;
  matchType: string;
  bucketId: string;
  prioridad: number;
}> = [
  // ── Necesidades (alimentos, transporte, salud, servicios básicos) ──
  { id: 'pat-lider',         patron: 'lider',          matchType: 'CONTAINS',    bucketId: BUCKET_IDS[Bucket.Necesidades], prioridad: 10 },
  { id: 'pat-jumbo',         patron: 'jumbo',          matchType: 'CONTAINS',    bucketId: BUCKET_IDS[Bucket.Necesidades], prioridad: 10 },
  { id: 'pat-unimarc',       patron: 'unimarc',        matchType: 'CONTAINS',    bucketId: BUCKET_IDS[Bucket.Necesidades], prioridad: 10 },
  { id: 'pat-santa-isabel',  patron: 'santa isabel',   matchType: 'CONTAINS',    bucketId: BUCKET_IDS[Bucket.Necesidades], prioridad: 10 },
  { id: 'pat-tottus',        patron: 'tottus',         matchType: 'CONTAINS',    bucketId: BUCKET_IDS[Bucket.Necesidades], prioridad: 10 },
  { id: 'pat-copec',         patron: 'copec',          matchType: 'CONTAINS',    bucketId: BUCKET_IDS[Bucket.Necesidades], prioridad: 15 },
  { id: 'pat-shell',         patron: 'shell',          matchType: 'CONTAINS',    bucketId: BUCKET_IDS[Bucket.Necesidades], prioridad: 15 },
  { id: 'pat-farmacia',      patron: 'farmacia',       matchType: 'CONTAINS',    bucketId: BUCKET_IDS[Bucket.Necesidades], prioridad: 20 },
  { id: 'pat-isapre',        patron: 'isapre',         matchType: 'CONTAINS',    bucketId: BUCKET_IDS[Bucket.Necesidades], prioridad: 20 },
  { id: 'pat-transantiago',  patron: 'transantiago',   matchType: 'CONTAINS',    bucketId: BUCKET_IDS[Bucket.Necesidades], prioridad: 20 },
  { id: 'pat-bip',           patron: 'bip',            matchType: 'CONTAINS',    bucketId: BUCKET_IDS[Bucket.Necesidades], prioridad: 25 },

  // ── Deseos (entretenimiento, restaurantes, suscripciones) ──
  { id: 'pat-netflix',       patron: 'netflix',        matchType: 'CONTAINS',    bucketId: BUCKET_IDS[Bucket.Deseos], prioridad: 10 },
  { id: 'pat-spotify',       patron: 'spotify',        matchType: 'CONTAINS',    bucketId: BUCKET_IDS[Bucket.Deseos], prioridad: 10 },
  { id: 'pat-amazon-prime',  patron: 'prime video',    matchType: 'CONTAINS',    bucketId: BUCKET_IDS[Bucket.Deseos], prioridad: 10 },
  { id: 'pat-uber-eats',     patron: 'uber eats',      matchType: 'CONTAINS',    bucketId: BUCKET_IDS[Bucket.Deseos], prioridad: 15 },
  { id: 'pat-rappi',         patron: 'rappi',          matchType: 'CONTAINS',    bucketId: BUCKET_IDS[Bucket.Deseos], prioridad: 15 },

  // ── Ahorro (transferencias a fintech / ahorro / inversión) ──
  { id: 'pat-fintual',       patron: 'fintual',        matchType: 'CONTAINS',    bucketId: BUCKET_IDS[Bucket.Ahorro], prioridad: 10 },
  { id: 'pat-bci-ahorro',    patron: 'cuenta ahorro',  matchType: 'CONTAINS',    bucketId: BUCKET_IDS[Bucket.Ahorro], prioridad: 20 },
  // AFP abreviada en cartola: "AFP ..." — STARTS_WITH para anclar y evitar false positives
  { id: 'pat-afp',           patron: 'afp ',           matchType: 'STARTS_WITH', bucketId: BUCKET_IDS[Bucket.Ahorro], prioridad: 15 },
  // Transferencia a cuenta propia o de ahorro: REGEX acotado
  { id: 'pat-transferencia-ahorro', patron: '^transf(?:erencia)?.*ahorro', matchType: 'REGEX', bucketId: BUCKET_IDS[Bucket.Ahorro], prioridad: 25 },
];

/**
 * Número total de patrones en el catálogo chileno — derivado del array real.
 * Exportado para los tests de idempotencia: seed count and test expectation share
 * the same source of truth, so they can never silently drift apart.
 */
export const PATRON_CATALOG_SIZE = PATRON_CATALOG.length;

export async function runSeed(prisma: SeedClient): Promise<void> {
  // ── US-011: usuario y cuenta fija ──
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

  // ── US-012: 5 BucketPresupuesto con ids fijos (single-sourced via BUCKET_IDS) ──
  const buckets: Array<{ id: string; nombre: string }> = [
    { id: BUCKET_IDS[Bucket.Necesidades], nombre: Bucket.Necesidades },
    { id: BUCKET_IDS[Bucket.Deseos], nombre: Bucket.Deseos },
    { id: BUCKET_IDS[Bucket.Ahorro], nombre: Bucket.Ahorro },
    { id: BUCKET_IDS[Bucket.Ingreso], nombre: Bucket.Ingreso },
    { id: BUCKET_IDS[Bucket.SinCategoria], nombre: Bucket.SinCategoria },
  ];

  for (const bucket of buckets) {
    await prisma.bucketPresupuesto.upsert({
      where: { id: bucket.id },
      create: { id: bucket.id, nombre: bucket.nombre },
      update: { nombre: bucket.nombre },
    });
  }

  // ── US-012: Catálogo de patrones chilenos (from module-level PATRON_CATALOG) ──
  for (const patron of PATRON_CATALOG) {
    await prisma.patronClasificacion.upsert({
      where: { id: patron.id },
      create: {
        id: patron.id,
        patron: patron.patron,
        matchType: patron.matchType,
        bucketId: patron.bucketId,
        prioridad: patron.prioridad,
      },
      update: {
        patron: patron.patron,
        matchType: patron.matchType,
        bucketId: patron.bucketId,
        prioridad: patron.prioridad,
      },
    });
  }
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
