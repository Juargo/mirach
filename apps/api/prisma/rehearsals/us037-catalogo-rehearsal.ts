import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { existsSync, renameSync } from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import { assertDestructiveDbAllowed } from '../../src/infrastructure/persistence/db-safety';

/**
 * us037-catalogo-rehearsal.ts — migration rehearsal script for
 * `prisma/migrations/20260811200000_us037_catalogo_per_user` (design.md
 * §9.3, tasks 1.5/1.6). **Not CI-automated.** Re-runnable by design: task
 * 6.9 reuses this same script for rehearsal run 3, pointed at a restored
 * prod snapshot immediately before the production deploy.
 *
 * Runs entirely against a THROWAWAY database (`<base>_rehearsal`, derived
 * from `DATABASE_URL`'s own dbname) that this script creates and drops
 * itself — it NEVER touches the real `moneydiary_test`/`moneydiary_dev`
 * database's data. The us037 migration directory is temporarily "parked"
 * (renamed out of `prisma/migrations/`) while prior migrations are applied,
 * so the rehearsal database can be seeded with pre-migration-shape data
 * before the migration under test runs — exactly like a real deploy.
 *
 * Usage (from `apps/api/`):
 *   ALLOW_DESTRUCTIVE_DB=1 DOTENV_CONFIG_PATH=.env.test \
 *     pnpm exec tsx prisma/rehearsals/us037-catalogo-rehearsal.ts prod-like
 *   ALLOW_DESTRUCTIVE_DB=1 DOTENV_CONFIG_PATH=.env.test \
 *     pnpm exec tsx prisma/rehearsals/us037-catalogo-rehearsal.ts multi-user-guard
 *   ALLOW_DESTRUCTIVE_DB=1 DOTENV_CONFIG_PATH=.env.test \
 *     pnpm exec tsx prisma/rehearsals/us037-catalogo-rehearsal.ts fresh-db
 *   ALLOW_DESTRUCTIVE_DB=1 DOTENV_CONFIG_PATH=.env.test \
 *     pnpm exec tsx prisma/rehearsals/us037-catalogo-rehearsal.ts all
 *
 * Interrupt safety: the try/finally around each scenario's
 * park→migrate→unpark sequence restores the parked migration directory on
 * any error. Ctrl-C (SIGINT) and SIGTERM are also covered — a small
 * top-level signal handler (below) calls the same restore and exits, which
 * is necessary because Node's default disposition for those signals kills
 * the process immediately without running `finally`; the handler is what
 * keeps the process alive long enough for the restore to happen. None of
 * this protects against a hard kill (SIGKILL, crash, power loss): if that
 * happens, look for a leftover `.rehearsal-parked-*` directory directly
 * under `apps/api/prisma/` (a SIBLING of `migrations/`, not inside it) and
 * manually rename it back to
 * `migrations/20260811200000_us037_catalogo_per_user`. An interrupted run
 * may also leave the `<base>_rehearsal` database behind — harmless, the
 * next run drops and recreates it.
 */

const MIGRATION_DIR_NAME = '20260811200000_us037_catalogo_per_user';
const MIGRATIONS_ROOT = path.resolve(__dirname, '../migrations');
const MIGRATION_DIR = path.join(MIGRATIONS_ROOT, MIGRATION_DIR_NAME);
const PARKED_DIR = path.resolve(
  __dirname,
  `../.rehearsal-parked-${MIGRATION_DIR_NAME}`,
);
const API_ROOT = path.resolve(__dirname, '../..');

type Scenario = 'prod-like' | 'multi-user-guard' | 'fresh-db';

function log(msg: string): void {
  console.log(msg);
}

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
  log(`  ✓ ${message}`);
}

/** Derives `<base>_rehearsal` from the configured DATABASE_URL. */
function rehearsalConnectionString(): { url: string; dbName: string } {
  const base = process.env.DATABASE_URL;
  if (!base) {
    throw new Error(
      'DATABASE_URL no definido — corré con DOTENV_CONFIG_PATH=.env.test (ver apps/api/docs/local-test-db.md)',
    );
  }
  const parsed = new URL(base);
  const baseDbName = parsed.pathname.replace(/^\//, '');
  const dbName = `${baseDbName}_rehearsal`;
  parsed.pathname = `/${dbName}`;
  return { url: parsed.toString(), dbName };
}

/** Admin connection string pointed at the `postgres` maintenance database, used only to CREATE/DROP the rehearsal database. */
function adminConnectionString(baseUrl: string): string {
  const parsed = new URL(baseUrl);
  parsed.pathname = '/postgres';
  return parsed.toString();
}

async function recreateRehearsalDatabase(
  rehearsalUrl: string,
  dbName: string,
): Promise<void> {
  const admin = new Client({
    connectionString: adminConnectionString(rehearsalUrl),
  });
  await admin.connect();
  try {
    await admin.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [dbName],
    );
    await admin.query(`DROP DATABASE IF EXISTS "${dbName}"`);
    await admin.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await admin.end();
  }
}

async function dropRehearsalDatabase(
  rehearsalUrl: string,
  dbName: string,
): Promise<void> {
  const admin = new Client({
    connectionString: adminConnectionString(rehearsalUrl),
  });
  await admin.connect();
  try {
    await admin.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [dbName],
    );
    await admin.query(`DROP DATABASE IF EXISTS "${dbName}"`);
  } finally {
    await admin.end();
  }
}

function parkMigration(): void {
  if (existsSync(MIGRATION_DIR)) {
    renameSync(MIGRATION_DIR, PARKED_DIR);
  }
}

function unparkMigration(): void {
  if (existsSync(PARKED_DIR)) {
    renameSync(PARKED_DIR, MIGRATION_DIR);
  }
}

/**
 * Restores the parked migration directory on Ctrl-C/SIGTERM and exits.
 * Registering this handler is what keeps the process alive long enough for
 * the cleanup to run — without it, Node's default SIGINT/SIGTERM
 * disposition terminates the process immediately and no `finally` block
 * (sync or async) ever executes.
 */
function handleInterruptSignal(signal: NodeJS.Signals): void {
  log(`\nReceived ${signal}, restoring parked migration directory...`);
  unparkMigration();
  process.exit(1);
}

process.on('SIGINT', handleInterruptSignal);
process.on('SIGTERM', handleInterruptSignal);

/** Runs `prisma migrate deploy` against the rehearsal DB (env override, never the real DATABASE_URL). */
function migrateDeploy(
  rehearsalUrl: string,
): { ok: true } | { ok: false; error: string } {
  try {
    execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
      cwd: API_ROOT,
      stdio: 'pipe',
      env: {
        ...process.env,
        DATABASE_URL: rehearsalUrl,
        DIRECT_URL: rehearsalUrl,
      },
    });
    return { ok: true };
  } catch (err) {
    const stderr =
      err && typeof err === 'object' && 'stderr' in err
        ? String((err as { stderr: Buffer | string }).stderr)
        : '';
    return {
      ok: false,
      error: stderr || (err instanceof Error ? err.message : String(err)),
    };
  }
}

async function withClient<T>(
  connectionString: string,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** Seeds a bootstrap non-demo user + a demo user, each with an account/ingesta/categorized transaction, plus a couple of PatronClasificacion rows — the "prod-like" scenario. Runs against the PRE-migration shape (no userId column yet). */
async function seedProdLikeScenario(rehearsalUrl: string): Promise<{
  bootstrapUserId: string;
  demoUserId: string;
  bootstrapTxId: string;
  demoTxId: string;
  demoAccountId: string;
}> {
  const bootstrapUserId = 'reh-user-bootstrap';
  const demoUserId = 'reh-user-demo';
  const bootstrapAccountId = 'reh-account-bootstrap';
  const demoAccountId = 'reh-account-demo';
  const bootstrapIngestaId = 'reh-ingesta-bootstrap';
  const demoIngestaId = 'reh-ingesta-demo';
  const bootstrapTxId = 'reh-tx-bootstrap';
  const demoTxId = 'reh-tx-demo';

  await withClient(rehearsalUrl, async (client) => {
    await client.query(
      `INSERT INTO "User" (id, nombre, "esDemo") VALUES ($1, 'Rehearsal Bootstrap', false)`,
      [bootstrapUserId],
    );
    await client.query(
      `INSERT INTO "User" (id, nombre, "esDemo", "demoCreatedAt") VALUES ($1, 'Rehearsal Demo', true, now())`,
      [demoUserId],
    );

    await client.query(
      `INSERT INTO "Account" (id, "userId", banco, "tipoCuenta", "numeroCuenta") VALUES ($1, $2, 'BancoEstado', 'Cuenta Corriente', '111111111')`,
      [bootstrapAccountId, bootstrapUserId],
    );
    await client.query(
      `INSERT INTO "Account" (id, "userId", banco, "tipoCuenta", "numeroCuenta") VALUES ($1, $2, 'BancoEstado', 'Cuenta Corriente', '222222222')`,
      [demoAccountId, demoUserId],
    );

    await client.query(
      `INSERT INTO "Ingesta" (id, "userId", "accountId", "nombreArchivo", estado) VALUES ($1, $2, $3, 'rehearsal-bootstrap.xlsx', 'PROCESADA')`,
      [bootstrapIngestaId, bootstrapUserId, bootstrapAccountId],
    );
    await client.query(
      `INSERT INTO "Ingesta" (id, "userId", "accountId", "nombreArchivo", estado) VALUES ($1, $2, $3, 'rehearsal-demo.xlsx', 'PROCESADA')`,
      [demoIngestaId, demoUserId, demoAccountId],
    );

    // Categoria/BucketPresupuesto rows with these fixed ids already exist —
    // self-provisioned by migration 20260719005000_backfill_patron_categoria.
    await client.query(
      `INSERT INTO "Transaccion" (id, "ingestaId", "accountId", fecha, descripcion, cargo, abono, "bucketId", "categoriaId") VALUES ($1, $2, $3, now(), 'Jumbo Providencia', '15000', '0', 'bucket-necesidades', 'categoria-supermercado')`,
      [bootstrapTxId, bootstrapIngestaId, bootstrapAccountId],
    );
    await client.query(
      `INSERT INTO "Transaccion" (id, "ingestaId", "accountId", fecha, descripcion, cargo, abono, "bucketId", "categoriaId") VALUES ($1, $2, $3, now(), 'Netflix.com', '9000', '0', 'bucket-deseos', 'categoria-streaming')`,
      [demoTxId, demoIngestaId, demoAccountId],
    );

    await client.query(
      `INSERT INTO "Session" (id, "userId", "tokenHash", "expiresAt") VALUES ('reh-session-demo', $1, 'reh-token-hash-demo', now() + interval '7 days')`,
      [demoUserId],
    );

    await client.query(
      `INSERT INTO "PatronClasificacion" (id, patron, "matchType", "categoriaId", prioridad) VALUES ('reh-pat-jumbo', 'jumbo', 'CONTAINS', 'categoria-supermercado', 10)`,
    );
    await client.query(
      `INSERT INTO "PatronClasificacion" (id, patron, "matchType", "categoriaId", prioridad) VALUES ('reh-pat-netflix', 'netflix', 'CONTAINS', 'categoria-streaming', 10)`,
    );
  });

  return {
    bootstrapUserId,
    demoUserId,
    bootstrapTxId,
    demoTxId,
    demoAccountId,
  };
}

/** FK/index constraint assertions common to every post-migration scenario (prod-like and fresh-db both need the full set). */
async function assertCoreConstraints(client: Client): Promise<void> {
  const constraints = await client.query<{ conname: string }>(
    `SELECT conname FROM pg_constraint WHERE conname IN (
      'Categoria_userId_fkey',
      'PatronClasificacion_categoriaId_userId_fkey'
    )`,
  );
  assert(
    constraints.rows.some((r) => r.conname === 'Categoria_userId_fkey'),
    'Categoria.userId -> User(id) FK exists',
  );
  assert(
    constraints.rows.some(
      (r) => r.conname === 'PatronClasificacion_categoriaId_userId_fkey',
    ),
    'composite FK (categoriaId, userId) -> Categoria(id, userId) exists',
  );

  const indexes = await client.query<{ indexname: string }>(
    `SELECT indexname FROM pg_indexes WHERE tablename IN ('Categoria', 'PatronClasificacion')`,
  );
  const indexNames = indexes.rows.map((r) => r.indexname);
  assert(
    indexNames.includes('Categoria_userId_nombre_key'),
    'unique index (userId, nombre) exists on Categoria',
  );
  assert(
    indexNames.includes('Categoria_id_userId_key'),
    'unique index (id, userId) exists on Categoria (composite FK target)',
  );
  assert(
    indexNames.includes('PatronClasificacion_userId_idx'),
    'index on PatronClasificacion.userId exists',
  );
  assert(
    !indexNames.includes('Categoria_nombre_key'),
    'old global unique index on Categoria.nombre was dropped',
  );
}

async function assertProdLikeOutcome(
  rehearsalUrl: string,
  seeded: Awaited<ReturnType<typeof seedProdLikeScenario>>,
): Promise<void> {
  await withClient(rehearsalUrl, async (client) => {
    const cat = await client.query<{ userId: string }>(
      `SELECT "userId" FROM "Categoria"`,
    );
    assert(
      cat.rows.length === 8,
      `bootstrap catalog has exactly 8 Categoria rows (got ${cat.rows.length})`,
    );
    assert(
      cat.rows.every((r) => r.userId === seeded.bootstrapUserId),
      'every Categoria row is owned by the bootstrap user',
    );

    const pat = await client.query<{ userId: string }>(
      `SELECT "userId" FROM "PatronClasificacion"`,
    );
    assert(
      pat.rows.length === 2,
      `PatronClasificacion has the 2 seeded rows (got ${pat.rows.length})`,
    );
    assert(
      pat.rows.every((r) => r.userId === seeded.bootstrapUserId),
      'every PatronClasificacion row inherited the bootstrap user as owner',
    );

    const tx = await client.query<{ categoriaId: string | null }>(
      `SELECT "categoriaId" FROM "Transaccion" WHERE id = $1`,
      [seeded.bootstrapTxId],
    );
    assert(
      tx.rows[0]?.categoriaId === 'categoria-supermercado',
      "bootstrap user's Transaccion.categoriaId is unchanged by the migration (D-05)",
    );

    const demoUser = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "User" WHERE id = $1`,
      [seeded.demoUserId],
    );
    assert(demoUser.rows[0].n === 0, 'demo user was purged');

    const demoAccount = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "Account" WHERE "userId" = $1`,
      [seeded.demoUserId],
    );
    assert(demoAccount.rows[0].n === 0, "demo user's Account row was purged");

    const demoTx = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "Transaccion" WHERE "accountId" = $1`,
      [seeded.demoAccountId],
    );
    assert(demoTx.rows[0].n === 0, "demo user's Transaccion rows were purged");

    const demoSession = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "Session" WHERE "userId" = $1`,
      [seeded.demoUserId],
    );
    assert(demoSession.rows[0].n === 0, "demo user's Session row was purged");

    const demoIngesta = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "Ingesta" WHERE "userId" = $1`,
      [seeded.demoUserId],
    );
    assert(demoIngesta.rows[0].n === 0, "demo user's Ingesta rows were purged");

    await assertCoreConstraints(client);
  });
}

async function seedMultiUserScenario(rehearsalUrl: string): Promise<void> {
  await withClient(rehearsalUrl, async (client) => {
    await client.query(
      `INSERT INTO "User" (id, nombre, "esDemo") VALUES ('reh-user-a', 'Rehearsal A', false)`,
    );
    await client.query(
      `INSERT INTO "User" (id, nombre, "esDemo") VALUES ('reh-user-b', 'Rehearsal B', false)`,
    );
  });
}

async function assertGuardOutcome(rehearsalUrl: string): Promise<void> {
  await withClient(rehearsalUrl, async (client) => {
    const col = await client.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'Categoria' AND column_name = 'userId'`,
    );
    assert(
      col.rows.length === 0,
      'migration transaction rolled back — Categoria.userId column was never added',
    );

    const users = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "User" WHERE "esDemo" = false`,
    );
    assert(
      users.rows[0].n === 2,
      'both non-demo users are untouched (guard aborted before any write)',
    );
  });
}

/** Asserts the "fresh-db" scenario outcome: no seeded users, so step 0's fresh-database branch (guard n_reales === 0) is the only path exercised. */
async function assertFreshDbOutcome(rehearsalUrl: string): Promise<void> {
  await withClient(rehearsalUrl, async (client) => {
    const cat = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "Categoria"`,
    );
    assert(
      cat.rows[0].n === 0,
      'owner-less Categoria rows self-provisioned by migration 20260719005000 were cleared (got ' +
        `${cat.rows[0].n})`,
    );

    const pat = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "PatronClasificacion"`,
    );
    assert(
      pat.rows[0].n === 0,
      'owner-less PatronClasificacion rows were cleared (got ' +
        `${pat.rows[0].n})`,
    );

    await assertCoreConstraints(client);
  });
}

async function runProdLike(): Promise<void> {
  log('\n=== Rehearsal run 1: prod-like (bootstrap + demo user) ===');
  const { url, dbName } = rehearsalConnectionString();
  await recreateRehearsalDatabase(url, dbName);

  parkMigration();
  try {
    const pre = migrateDeploy(url);
    if (!pre.ok) {
      throw new Error(
        `base migrations failed to apply to the rehearsal DB:\n${pre.error}`,
      );
    }
  } finally {
    unparkMigration();
  }

  const seeded = await seedProdLikeScenario(url);

  const result = migrateDeploy(url);
  if (!result.ok) {
    throw new Error(
      `us037 migration FAILED to apply on the prod-like scenario:\n${result.error}`,
    );
  }
  log('  migration applied cleanly');

  await assertProdLikeOutcome(url, seeded);
  log('PASS: prod-like rehearsal');
}

async function runMultiUserGuard(): Promise<void> {
  log('\n=== Rehearsal run 2: multi-user guard (two non-demo users) ===');
  const { url, dbName } = rehearsalConnectionString();
  await recreateRehearsalDatabase(url, dbName);

  parkMigration();
  try {
    const pre = migrateDeploy(url);
    if (!pre.ok) {
      throw new Error(
        `base migrations failed to apply to the rehearsal DB:\n${pre.error}`,
      );
    }
  } finally {
    unparkMigration();
  }

  await seedMultiUserScenario(url);

  const result = migrateDeploy(url);
  assert(
    !result.ok,
    'us037 migration raises with more than one non-demo user present',
  );
  assert(
    /us-037/.test(result.ok ? '' : result.error),
    'the raised error is the us-037 guard exception, not an unrelated failure',
  );

  await assertGuardOutcome(url);
  log('PASS: multi-user guard rehearsal');
}

async function runFreshDb(): Promise<void> {
  log('\n=== Rehearsal: fresh-db (CI/empty-database scenario) ===');
  const { url, dbName } = rehearsalConnectionString();
  await recreateRehearsalDatabase(url, dbName);

  parkMigration();
  try {
    const pre = migrateDeploy(url);
    if (!pre.ok) {
      throw new Error(
        `base migrations failed to apply to the rehearsal DB:\n${pre.error}`,
      );
    }
  } finally {
    unparkMigration();
  }

  // The base migrations self-provision 8 owner-less Categoria rows
  // (20260719005000), but that migration's PatronClasificacion UPDATE only
  // touches pre-existing rows with a matching fixed id — on a genuinely
  // fresh DB there are none yet, so PatronClasificacion stays empty on its
  // own. Insert one owner-less row here (fixed id from the
  // 20260719005000 UPDATE list, pointed at a self-provisioned Categoria)
  // so the post-migration count-0 assertion actually proves Step 0's
  // DELETE ran, instead of trivially passing on an already-empty table.
  await withClient(url, async (client) => {
    await client.query(
      `INSERT INTO "PatronClasificacion" (id, patron, "matchType", "categoriaId", prioridad) VALUES ('pat-jumbo', 'jumbo', 'CONTAINS', 'categoria-supermercado', 10)`,
    );
  });

  const result = migrateDeploy(url);
  if (!result.ok) {
    throw new Error(
      `us037 migration FAILED to apply on the fresh-db scenario:\n${result.error}`,
    );
  }
  log('  migration applied cleanly');

  await assertFreshDbOutcome(url);
  log('PASS: fresh-db rehearsal');
}

async function main(): Promise<void> {
  assertDestructiveDbAllowed();
  const scenario = (process.argv[2] ?? 'all') as Scenario | 'all';

  const { url, dbName } = rehearsalConnectionString();
  try {
    if (scenario === 'prod-like') {
      await runProdLike();
    } else if (scenario === 'multi-user-guard') {
      await runMultiUserGuard();
    } else if (scenario === 'fresh-db') {
      await runFreshDb();
    } else if (scenario === 'all') {
      await runProdLike();
      await runMultiUserGuard();
      await runFreshDb();
    } else {
      throw new Error(
        `Unknown scenario "${String(scenario)}" — expected prod-like | multi-user-guard | fresh-db | all`,
      );
    }
    log('\nAll rehearsal scenarios PASSED.');
  } finally {
    // Best-effort cleanup — leaves no rehearsal artifacts behind either way.
    await dropRehearsalDatabase(url, dbName).catch(() => undefined);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(
      '\nRehearsal FAILED:',
      err instanceof Error ? err.message : err,
    );
    process.exitCode = 1;
  });
}
