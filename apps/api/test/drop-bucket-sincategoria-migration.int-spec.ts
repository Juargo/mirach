import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Client } from 'pg';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';
import { loadEnv, resolveConnectionString } from '../src/config/env';
import { Bucket } from '../src/domain/value-objects/bucket';
import { BUCKET_IDS } from '../src/infrastructure/persistence/bucket-ids';
import { crearCatalogoParaUsuario } from './support/catalogo.fixture';
import { categoriaIdDe } from './helpers/categoria-fixture';

/**
 * Integration test for the raw SQL migration
 * `prisma/migrations/20260925000000_drop_bucket_sincategoria/migration.sql`
 * (issue #778 tramo 5b PR6 — retires the physical `bucket-sincategoria`
 * `BucketPresupuesto` row).
 *
 * ⚠️ NOT run locally for this PR — Docker/local Postgres was unavailable in
 * the dev environment that authored it (see
 * `correr-int-e2e-localmente.md`/`worktree-sin-env-prisma.md`). This runs as
 * part of `pnpm api test:integration` against the disposable CI Postgres
 * (ALLOW_DESTRUCTIVE_DB=1 gate, see `test/integration.setup.ts`).
 *
 * Exercises the EXACT bytes shipped in `migration.sql` — `readMigrationSql`
 * loads the real file and `extractGuardStep` slices out only the `DO $$ ...
 * END $$;` guard block (via the `@migration-step:` markers the file carries
 * for this purpose) — never a reimplementation of the SQL in TypeScript. Runs
 * through a raw `pg.Client` (not the Prisma client): Prisma's
 * `$executeRawUnsafe` goes through the extended query protocol, which
 * rejects a multi-statement string containing a `DO $$ ... $$` block;
 * `pg.Client.query(text)` with no parameters uses the simple query protocol,
 * which runs the whole migration exactly as `prisma migrate deploy` would.
 *
 * By the time this suite runs, `prisma migrate deploy` has ALREADY applied
 * this migration once as part of normal CI schema setup, so the
 * `bucket-sincategoria` row is already gone. Each test re-creates the
 * pre-migration legacy state (the `BucketPresupuesto` row + `Transaccion`
 * rows pointing at it) and re-runs the shipped SQL against it — this both
 * exercises the real per-user logic AND doubles as the idempotency proof
 * (the last test re-runs it a third time with nothing left to migrate).
 */

const MIGRATION_SQL_PATH = path.join(
  __dirname,
  '../prisma/migrations/20260925000000_drop_bucket_sincategoria/migration.sql',
);

function readMigrationSql(): string {
  return fs.readFileSync(MIGRATION_SQL_PATH, 'utf-8');
}

/**
 * Slices out ONLY the guard step (`DO $$ ... END $$;`) from the real
 * migration file, via the `@migration-step: guard-filas-restantes` marker —
 * used to prove the guard raises on a manufactured bad state WITHOUT running
 * the preceding UPDATE first (which would always clear that state, since it
 * unconditionally moves every matching row in one statement).
 */
function extractGuardStep(sql: string): string {
  const marker = '@migration-step: guard-filas-restantes';
  const markerIdx = sql.indexOf(marker);
  if (markerIdx === -1) {
    throw new Error(
      `migration.sql: no se encontró el marcador "${marker}" — este test depende de él, ver su docblock.`,
    );
  }
  const statementStart = sql.indexOf('\n', markerIdx) + 1;
  const terminator = 'END $$;';
  const terminatorIdx = sql.indexOf(terminator, statementStart);
  if (terminatorIdx === -1) {
    throw new Error(
      'migration.sql: no se encontró el terminador "END $$;" del guard block.',
    );
  }
  return sql.slice(statementStart, terminatorIdx + terminator.length).trim();
}

const RUN_ID = `dropsincat-${Date.now()}`;
const BUCKET_SINCATEGORIA_ID = 'bucket-sincategoria';

describe('migration 20260925000000_drop_bucket_sincategoria (integration — real dev DB)', () => {
  const prisma = createPrismaClient(loadEnv());
  const connectionString = resolveConnectionString(loadEnv());

  const userIdA = `user-a-${RUN_ID}`;
  const userIdB = `user-b-${RUN_ID}`;
  const userIdC = `user-c-${RUN_ID}`; // never gets a catalog — proves the NULL fallback
  const createdUserIds = [userIdA, userIdB, userIdC];
  const createdAccountIds: string[] = [];
  const createdIngestaIds: string[] = [];

  async function runSql(sql: string): Promise<void> {
    if (!connectionString) {
      throw new Error(
        'drop-bucket-sincategoria-migration.int-spec requiere DATABASE_URL/DIRECT_URL.',
      );
    }
    const client = new Client({ connectionString });
    await client.connect();
    try {
      await client.query(sql);
    } finally {
      await client.end();
    }
  }

  async function crearCuentaEIngesta(userId: string) {
    const account = await prisma.account.create({
      data: {
        userId,
        banco: 'BCI',
        tipoCuenta: 'Cuenta Corriente',
        numeroCuenta: `acc-${userId}`,
      },
    });
    createdAccountIds.push(account.id);
    const ingesta = await prisma.ingesta.create({
      data: {
        userId,
        accountId: account.id,
        banco: 'BCI',
        nombreArchivo: `${userId}.xlsx`,
        estado: 'PROCESADA',
      },
    });
    createdIngestaIds.push(ingesta.id);
    return { accountId: account.id, ingestaId: ingesta.id };
  }

  /** Re-creates the pre-migration legacy `BucketPresupuesto` row — the migration deletes it, so each test that needs it must restore it first. */
  async function restaurarBucketLegacy(): Promise<void> {
    await prisma.bucketPresupuesto.upsert({
      where: { id: BUCKET_SINCATEGORIA_ID },
      create: { id: BUCKET_SINCATEGORIA_ID, nombre: 'SinCategoria' },
      update: {},
    });
  }

  beforeAll(async () => {
    await prisma.$connect();
    for (const userId of createdUserIds) {
      await prisma.user.create({
        data: { id: userId, nombre: `Test ${userId}` },
      });
    }
    // A y B tienen catálogo completo (Desconocido marcada esInterna=true en
    // los 3 buckets asignables) — C deliberadamente NO, para probar el
    // fallback a categoriaId NULL cuando el dueño no tiene esa categoría.
    await crearCatalogoParaUsuario(prisma, userIdA);
    await crearCatalogoParaUsuario(prisma, userIdB);
  });

  afterAll(async () => {
    await prisma.transaccion.deleteMany({
      where: { ingestaId: { in: createdIngestaIds } },
    });
    await prisma.ingesta.deleteMany({
      where: { id: { in: createdIngestaIds } },
    });
    await prisma.account.deleteMany({
      where: { id: { in: createdAccountIds } },
    });
    await prisma.patronClasificacion.deleteMany({
      where: { userId: { in: [userIdA, userIdB] } },
    });
    await prisma.categoria.deleteMany({
      where: { userId: { in: [userIdA, userIdB] } },
    });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  it('mueve la plata legacy a Deseos, rellena la Desconocido del DUEÑO (nunca de otro usuario), preserva categoriaId ya asignado, deja NULL cuando el dueño no tiene Desconocido, y borra la fila BucketPresupuesto', async () => {
    await restaurarBucketLegacy();

    const { ingestaId: ingestaA, accountId: accountA } =
      await crearCuentaEIngesta(userIdA);
    const { ingestaId: ingestaB, accountId: accountB } =
      await crearCuentaEIngesta(userIdB);
    const { ingestaId: ingestaC, accountId: accountC } =
      await crearCuentaEIngesta(userIdC);

    const desconocidoDeseosA = await categoriaIdDe(prisma, {
      userId: userIdA,
      bucket: Bucket.Deseos,
      nombre: 'Desconocido',
    });
    const desconocidoDeseosB = await categoriaIdDe(prisma, {
      userId: userIdB,
      bucket: Bucket.Deseos,
      nombre: 'Desconocido',
    });
    // Isolation proof requires the two owners' Desconocido ids to actually differ.
    expect(desconocidoDeseosA).not.toBe(desconocidoDeseosB);

    const ahorroCategoriaA = await categoriaIdDe(prisma, {
      userId: userIdA,
      bucket: Bucket.Ahorro,
      nombre: 'Ahorro',
    });

    // A: fila sin categoriaId — debe recibir la Desconocido de Deseos DE A.
    const txASinCategoria = await prisma.transaccion.create({
      data: {
        accountId: accountA,
        ingestaId: ingestaA,
        fecha: new Date('2026-07-01'),
        descripcion: 'A sin categoria',
        cargo: 50_000n,
        abono: 0n,
        bucketId: BUCKET_SINCATEGORIA_ID,
      },
    });

    // A: fila que YA tenía categoriaId (integridad anómala) — nunca se pisa.
    const txAConCategoria = await prisma.transaccion.create({
      data: {
        accountId: accountA,
        ingestaId: ingestaA,
        fecha: new Date('2026-07-02'),
        descripcion: 'A con categoria previa',
        cargo: 8_000n,
        abono: 0n,
        bucketId: BUCKET_SINCATEGORIA_ID,
        categoriaId: ahorroCategoriaA,
      },
    });

    // B: fila sin categoriaId — debe recibir la Desconocido de Deseos DE B,
    // NUNCA la de A (aislamiento multi-tenant, RNF-SEC-006).
    const txBSinCategoria = await prisma.transaccion.create({
      data: {
        accountId: accountB,
        ingestaId: ingestaB,
        fecha: new Date('2026-07-03'),
        descripcion: 'B sin categoria',
        cargo: 13_000n,
        abono: 0n,
        bucketId: BUCKET_SINCATEGORIA_ID,
      },
    });

    // C: sin catálogo — la subquery correlacionada no encuentra Desconocido
    // alguna; categoriaId debe quedar NULL, nunca inventada ni tomada de A/B.
    const txCSinDesconocido = await prisma.transaccion.create({
      data: {
        accountId: accountC,
        ingestaId: ingestaC,
        fecha: new Date('2026-07-04'),
        descripcion: 'C sin desconocido marcada',
        cargo: 5_000n,
        abono: 0n,
        bucketId: BUCKET_SINCATEGORIA_ID,
      },
    });

    await runSql(readMigrationSql());

    const [rowA1, rowA2, rowB, rowC] = await Promise.all([
      prisma.transaccion.findUniqueOrThrow({
        where: { id: txASinCategoria.id },
      }),
      prisma.transaccion.findUniqueOrThrow({
        where: { id: txAConCategoria.id },
      }),
      prisma.transaccion.findUniqueOrThrow({
        where: { id: txBSinCategoria.id },
      }),
      prisma.transaccion.findUniqueOrThrow({
        where: { id: txCSinDesconocido.id },
      }),
    ]);

    expect(rowA1.bucketId).toBe(BUCKET_IDS[Bucket.Deseos]);
    expect(rowA1.categoriaId).toBe(desconocidoDeseosA);

    expect(rowA2.bucketId).toBe(BUCKET_IDS[Bucket.Deseos]);
    // Preserved verbatim — the migration never overwrites an existing categoriaId.
    expect(rowA2.categoriaId).toBe(ahorroCategoriaA);

    expect(rowB.bucketId).toBe(BUCKET_IDS[Bucket.Deseos]);
    expect(rowB.categoriaId).toBe(desconocidoDeseosB);
    // Cross-tenant guard: B's row must NEVER resolve to A's Desconocido.
    expect(rowB.categoriaId).not.toBe(desconocidoDeseosA);

    expect(rowC.bucketId).toBe(BUCKET_IDS[Bucket.Deseos]);
    expect(rowC.categoriaId).toBeNull();

    const bucketRow = await prisma.bucketPresupuesto.findUnique({
      where: { id: BUCKET_SINCATEGORIA_ID },
    });
    expect(bucketRow).toBeNull();
  });

  it('es idempotente: correrla de nuevo sobre una BD sin filas legacy no falla y no cambia nada', async () => {
    // At this point (after the previous test) the bucket row is already gone
    // and no Transaccion references it — exactly the "prod ya limpiada"
    // scenario the task calls out.
    await expect(runSql(readMigrationSql())).resolves.toBeUndefined();

    const bucketRow = await prisma.bucketPresupuesto.findUnique({
      where: { id: BUCKET_SINCATEGORIA_ID },
    });
    expect(bucketRow).toBeNull();
  });

  it('guard-filas-restantes: si una fila SIGUE apuntando al bucket legacy, el guard aborta con RAISE EXCEPTION antes de cualquier DROP', async () => {
    // Manufactures the state the guard exists to catch: a Transaccion still
    // pointing at the legacy id, WITHOUT running the preceding UPDATE step
    // (which would always clear it in one statement — that's exactly why the
    // guard can only be proven by running it standalone against a bad state).
    await restaurarBucketLegacy();
    const { ingestaId, accountId } = await crearCuentaEIngesta(userIdA);
    await prisma.transaccion.create({
      data: {
        accountId,
        ingestaId,
        fecha: new Date('2026-07-05'),
        descripcion: 'fila que el guard debe cazar',
        cargo: 1_000n,
        abono: 0n,
        bucketId: BUCKET_SINCATEGORIA_ID,
      },
    });

    const guardSql = extractGuardStep(readMigrationSql());
    await expect(runSql(guardSql)).rejects.toThrow(/drop_bucket_sincategoria/);

    // The guard only raises — it never mutates. Bucket row and Transaccion
    // both survive exactly as they were.
    const bucketRow = await prisma.bucketPresupuesto.findUnique({
      where: { id: BUCKET_SINCATEGORIA_ID },
    });
    expect(bucketRow).not.toBeNull();

    // Clean up the manufactured bad state ourselves — the migration never ran
    // to completion here, so nothing did it for us.
    await prisma.transaccion.deleteMany({
      where: { bucketId: BUCKET_SINCATEGORIA_ID, accountId },
    });
    await runSql(readMigrationSql());
  });
});
