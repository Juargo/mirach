import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  USER_ID_FIJO,
  ACCOUNT_ID_FIJO,
} from '../src/infrastructure/persistence/constants';
import { BUCKET_IDS } from '../src/infrastructure/persistence/bucket-ids';
import { Bucket } from '../src/domain/value-objects/bucket';
import { CATEGORIA_IDS } from '../src/infrastructure/persistence/categoria-ids';
import {
  CATEGORIA_TEMPLATE,
  CATEGORIA_TEMPLATE_SIZE,
  PATRON_TEMPLATE,
  PATRON_TEMPLATE_SIZE,
  type CategoriaTemplateNombre,
} from '../src/infrastructure/persistence/catalogo-template';
import { assertDestructiveDbAllowed } from '../src/infrastructure/persistence/db-safety';
import { Argon2PasswordHasher } from '../src/infrastructure/http/auth/argon2-password-hasher';
import { AesGcmCryptoService } from '../src/infrastructure/persistence/aes-gcm-crypto.service';
import { HmacBlindIndexService } from '../src/infrastructure/persistence/hmac-blind-index.service';
import { deriveBlindIndexKey } from '../src/composition/derive-blind-index-key';
import { normalizeNumeroCuenta } from '../src/infrastructure/persistence/normalize-numero-cuenta';
import { isValid32ByteBase64Key } from '../src/config/env';

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
type SeedClient = Pick<
  PrismaClient,
  'user' | 'account' | 'bucketPresupuesto' | 'patronClasificacion' | 'categoria'
>;

// ── US-013 S1 / US-037 D-07: Catálogo de Categoria del usuario bootstrap.
// El CONTENIDO (qué categorías, qué bucket) viene single-sourced de
// CATEGORIA_TEMPLATE (catalogo-template.ts) — el seed solo le agrega los ids
// FIJOS (CATEGORIA_IDS), porque a diferencia de copiarCatalogoTemplate (ids
// generados, un shot por usuario nuevo) el seed necesita upsert-por-id-fijo
// para su garantía de idempotencia (D-07: dos escritores, un contenido).
const CATEGORIA_CATALOG: Array<{
  id: string;
  nombre: CategoriaTemplateNombre;
  bucketId: string;
}> = CATEGORIA_TEMPLATE.map((categoria) => ({
  id: CATEGORIA_IDS[categoria.nombre],
  nombre: categoria.nombre,
  // bucketId SIEMPRE derivado en el write site (ADR-037 D-02) — BUCKET_IDS
  // sigue siendo la única autoridad de ids físicos, igual que
  // copiarCatalogoTemplate.
  bucketId: BUCKET_IDS[categoria.bucket],
}));

/**
 * Número total de categorías del catálogo — re-exportado desde
 * CATEGORIA_TEMPLATE_SIZE (US-037 §7) para que los imports existentes
 * (`seed-catalog.spec.ts`) sigan funcionando mientras la fuente de verdad se
 * muda a la plantilla.
 */
export const CATEGORIA_CATALOG_SIZE = CATEGORIA_TEMPLATE_SIZE;

// ── US-012/US-013 S2 / US-037 D-07: ids fijos de patrones (idempotencia del
// seed). Keyed por el texto del patrón — PATRON_TEMPLATE garantiza `patron`
// único dentro de la plantilla (D-08 depende de esa unicidad), así que el
// texto es una clave de lookup segura para reconectar cada entrada de la
// plantilla con su id histórico de la era pre-US-037.
const PATRON_ID_FIJO: Record<string, string> = {
  lider: 'pat-lider',
  jumbo: 'pat-jumbo',
  unimarc: 'pat-unimarc',
  'santa isabel': 'pat-santa-isabel',
  tottus: 'pat-tottus',
  copec: 'pat-copec',
  shell: 'pat-shell',
  farmacia: 'pat-farmacia',
  isapre: 'pat-isapre',
  transantiago: 'pat-transantiago',
  bip: 'pat-bip',
  netflix: 'pat-netflix',
  spotify: 'pat-spotify',
  'prime video': 'pat-amazon-prime',
  'uber eats': 'pat-uber-eats',
  rappi: 'pat-rappi',
  fintual: 'pat-fintual',
  'cuenta ahorro': 'pat-bci-ahorro',
  'afp ': 'pat-afp',
  '^transf(?:erencia)?.*ahorro': 'pat-transferencia-ahorro',
};

// ── US-012/US-013 S2 / US-037 D-07: Catálogo de patrones chilenos del
// usuario bootstrap. El CONTENIDO (patrón, matchType, categoría, prioridad)
// viene single-sourced de PATRON_TEMPLATE (catalogo-template.ts); el seed
// solo agrega el id fijo (PATRON_ID_FIJO) y resuelve `categoria` (enum) a
// `categoriaId` (id físico) vía CATEGORIA_IDS — mismo patrón que
// CATEGORIA_CATALOG arriba (D-07: dos escritores, un contenido).
//
// bucketId no se escribe aquí — PatronClasificacion.bucketId fue DROPeado de
// la BD (ver migración drop_patron_bucketid); el bucket de cada patrón se
// deriva SIEMPRE de su categoriaId (CATEGORIA_BUCKET), nunca se almacena
// independientemente (CAT-02).
const PATRON_CATALOG: Array<{
  id: string;
  patron: string;
  matchType: string;
  categoriaId: string;
  prioridad: number;
}> = PATRON_TEMPLATE.map((patron) => ({
  id: PATRON_ID_FIJO[patron.patron],
  patron: patron.patron,
  matchType: patron.matchType,
  categoriaId: CATEGORIA_IDS[patron.categoria],
  prioridad: patron.prioridad,
}));

/**
 * Número total de patrones en el catálogo chileno — re-exportado desde
 * PATRON_TEMPLATE_SIZE (US-037 §7) para que los imports existentes
 * (`seed-catalog.spec.ts`, `seed.int-spec.ts`) sigan funcionando mientras la
 * fuente de verdad se muda a la plantilla.
 */
export const PATRON_CATALOG_SIZE = PATRON_TEMPLATE_SIZE;

export async function runSeed(prisma: SeedClient): Promise<void> {
  // ── US-011: usuario y cuenta fija ──
  await prisma.user.upsert({
    where: { id: USER_ID_FIJO },
    create: { id: USER_ID_FIJO, nombre: 'Usuario MoneyDiary' },
    update: {},
  });

  // `crypto`/`blindIndex` se construyen SIEMPRE (no solo para el backfill de
  // credenciales) — desde US-035 Slice 2 la cuenta semilla también cifra
  // `numeroCuenta` + computa su blind index. Se lee `process.env.ENCRYPTION_KEY`
  // DIRECTO (no vía `loadEnv()`, que también validaría DATABASE_URL/NODE_ENV
  // — fuera del scope de esta función y rompería los unit tests con
  // SeedClient fake, ver seed-catalog.spec.ts) — mismo patrón que los scripts
  // de backfill (backfill-email-blind-index.ts). MISMA derivación HKDF que
  // `container.ts` (ver derive-blind-index-key.ts) — para que el índice que
  // escribe el seed matchee el que consultan login/ingesta.
  const rawEncryptionKey = process.env.ENCRYPTION_KEY;
  if (!rawEncryptionKey || !isValid32ByteBase64Key(rawEncryptionKey)) {
    throw new Error(
      'runSeed requiere ENCRYPTION_KEY (base64, 32 bytes exactos — AES-256, ADR-013) en el entorno.',
    );
  }
  const encryptionKey = Buffer.from(rawEncryptionKey, 'base64');
  const crypto = new AesGcmCryptoService(encryptionKey);
  const blindIndex = new HmacBlindIndexService(
    deriveBlindIndexKey(encryptionKey),
  );

  // ── auth-login-session: backfill de credenciales de login (Slice 1) ──
  // Las credenciales vienen SIEMPRE de env, nunca hardcodeadas. Si el env no
  // está presente, se omite solo este backfill — el seed sigue siendo
  // ejecutable para el resto del estado (usuarios sin auth aún funcionan
  // igual que antes de este change).
  //
  // US-035: `email` se persiste CIFRADO (ADR-013) — ya no es buscable por
  // WHERE email=... — así que además se escribe `emailBlindIndex` (HMAC
  // determinístico) para que el login pueda encontrar la fila.
  const seedEmail = process.env.SEED_USER_EMAIL;
  const seedPassword = process.env.SEED_USER_PASSWORD;
  if (seedEmail && seedPassword) {
    const normalizedEmail = seedEmail.trim().toLowerCase();
    const passwordHash = await new Argon2PasswordHasher().hash(seedPassword);
    await prisma.user.update({
      where: { id: USER_ID_FIJO },
      data: {
        email: crypto.encrypt(normalizedEmail),
        emailBlindIndex: blindIndex.compute(normalizedEmail),
        passwordHash,
      },
    });
  }

  // US-035 Slice 2: numeroCuenta CIFRADO + blind index — mismo tratamiento
  // que cualquier cuenta real (ver PrismaAccountRepository.ensure).
  const numeroCuentaSeedNormalizado = normalizeNumeroCuenta(
    SEED_ACCOUNT.numeroCuenta,
  );
  await prisma.account.upsert({
    where: { id: ACCOUNT_ID_FIJO },
    create: {
      id: ACCOUNT_ID_FIJO,
      userId: USER_ID_FIJO,
      banco: SEED_ACCOUNT.banco,
      tipoCuenta: SEED_ACCOUNT.tipoCuenta,
      numeroCuenta: crypto.encrypt(numeroCuentaSeedNormalizado),
      numeroCuentaBlindIndex: blindIndex.compute(numeroCuentaSeedNormalizado),
    },
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

  // ── US-013 S1 / US-037: 8 Categoria con ids fijos (single-sourced via
  // CATEGORIA_IDS). userId SOLO en `create` — un `update` nunca debe
  // reescribir el owner de una fila ya existente (design.md §7). ──
  for (const categoria of CATEGORIA_CATALOG) {
    await prisma.categoria.upsert({
      where: { id: categoria.id },
      create: {
        id: categoria.id,
        userId: USER_ID_FIJO,
        nombre: categoria.nombre,
        bucketId: categoria.bucketId,
      },
      update: { nombre: categoria.nombre, bucketId: categoria.bucketId },
    });
  }

  // ── US-012 + US-013 S2 / US-037: Catálogo de patrones chilenos (from
  // module-level PATRON_CATALOG). Solo categoriaId — bucketId fue DROPeado
  // de la BD, el bucket se deriva siempre vía categoria.bucket (CAT-02).
  // userId SOLO en `create`, mismo criterio que Categoria arriba. ──
  for (const patron of PATRON_CATALOG) {
    await prisma.patronClasificacion.upsert({
      where: { id: patron.id },
      create: {
        id: patron.id,
        userId: USER_ID_FIJO,
        patron: patron.patron,
        matchType: patron.matchType,
        categoriaId: patron.categoriaId,
        prioridad: patron.prioridad,
      },
      update: {
        patron: patron.patron,
        matchType: patron.matchType,
        categoriaId: patron.categoriaId,
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

// Ejecuta solo como script (prisma db seed / tsx), no al importarse en tests.
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
