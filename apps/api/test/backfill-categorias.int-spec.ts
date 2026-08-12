/**
 * backfill-categorias.int-spec.ts — Integration tests for US-013 S3 backfill
 * (T3.1: idempotency, T3.2: --dry-run summary, T3.3: categoriaId IS NULL scope)
 *
 * These tests require:
 *  - A real dev/test Postgres DB (same as .env)
 *  - ALLOW_DESTRUCTIVE_DB=1
 *  - S1's migration (add_categoria_model) + S2's migration (drop_patron_bucketid) applied
 *  - seed.ts run (populates BucketPresupuesto/Categoria/PatronClasificacion rows)
 *
 * Gate: assertDestructiveDbAllowed() runs in integration.setup.ts (setupFiles).
 * Runs as part of the normal integration suite:
 * `ALLOW_DESTRUCTIVE_DB=1 pnpm api test:integration` against the disposable
 * local Postgres (see docs/local-test-db.md) — not against the shared dev DB.
 */
import 'dotenv/config';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';
import { loadEnv } from '../src/config/env';
import { runSeed } from '../prisma/seed';
import { runBackfill, main } from '../prisma/backfill-categorias';
import { Categoria } from '../src/domain/value-objects/categoria';
import { Bucket } from '../src/domain/value-objects/bucket';
import { BUCKET_IDS } from '../src/infrastructure/persistence/bucket-ids';
import { CATEGORIA_IDS } from '../src/infrastructure/persistence/categoria-ids';
import {
  ACCOUNT_ID_FIJO,
  USER_ID_FIJO,
} from '../src/infrastructure/persistence/constants';
import { crearCatalogoParaUsuario } from './support/catalogo.fixture';

describe('Backfill de categorías — integración (real dev DB)', () => {
  const prisma = createPrismaClient(loadEnv());

  let testIngestaId: string;

  beforeAll(async () => {
    await prisma.$connect();
    await runSeed(prisma);
  });

  beforeEach(async () => {
    const ingesta = await prisma.ingesta.create({
      data: {
        userId: USER_ID_FIJO,
        accountId: ACCOUNT_ID_FIJO,
        banco: 'BancoEstado',
        nombreArchivo: 'test-backfill.xlsx',
        estado: 'PROCESADA',
      },
    });
    testIngestaId = ingesta.id;
  });

  afterEach(async () => {
    if (testIngestaId) {
      await prisma.transaccion.deleteMany({
        where: { ingestaId: testIngestaId },
      });
      await prisma.ingesta.deleteMany({ where: { id: testIngestaId } });
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // T3.1 — re-running the backfill yields identical DB state.
  it('T3.1: correr el backfill dos veces produce el mismo estado (idempotencia, CAT-05)', async () => {
    await prisma.transaccion.create({
      data: {
        ingestaId: testIngestaId,
        accountId: ACCOUNT_ID_FIJO,
        fecha: new Date('2026-07-01'),
        descripcion: 'Compra Lider',
        cargo: 9500n,
        abono: 0n,
        // categoriaId/bucketId omitted → null, in scope
      },
    });

    const firstRun = await runBackfill(prisma, { dryRun: false });
    const afterFirst = await prisma.transaccion.findMany({
      where: { ingestaId: testIngestaId },
    });

    const secondRun = await runBackfill(prisma, { dryRun: false });
    const afterSecond = await prisma.transaccion.findMany({
      where: { ingestaId: testIngestaId },
    });

    expect(firstRun.totalRows).toBeGreaterThanOrEqual(1);
    // Second run finds nothing left in scope for OUR row (categoriaId now set).
    expect(afterSecond).toEqual(afterFirst);
    expect(secondRun.totalRows).toBe(0);
  });

  // T3.2 — --dry-run writes nothing and reports a summary.
  it('T3.2: --dry-run no escribe nada y reporta un resumen con conteo de cambios de bucket', async () => {
    const tx = await prisma.transaccion.create({
      data: {
        ingestaId: testIngestaId,
        accountId: ACCOUNT_ID_FIJO,
        fecha: new Date('2026-07-01'),
        descripcion: 'Compra Lider',
        cargo: 9500n,
        abono: 0n,
      },
    });

    const summary = await runBackfill(prisma, { dryRun: true });

    expect(summary.totalRows).toBeGreaterThanOrEqual(1);
    expect(summary.porCategoria[Categoria.Supermercado]).toBeGreaterThanOrEqual(
      1,
    );
    expect(summary.bucketChanges).toBeGreaterThanOrEqual(1);

    const untouched = await prisma.transaccion.findUnique({
      where: { id: tx.id },
    });
    expect(untouched?.categoriaId).toBeNull();
    expect(untouched?.bucketId).toBeNull();
  });

  // T3.3 — a manually-set categoriaId row is left untouched by a re-run.
  it('T3.3: una fila con categoriaId ya asignado manualmente queda fuera de scope (no se toca)', async () => {
    const tx = await prisma.transaccion.create({
      data: {
        ingestaId: testIngestaId,
        accountId: ACCOUNT_ID_FIJO,
        fecha: new Date('2026-07-01'),
        // Description would match "lider" → Supermercado if re-classified —
        // proves scope, not just "no matching pattern".
        descripcion: 'Compra Lider',
        cargo: 9500n,
        abono: 0n,
        categoriaId: CATEGORIA_IDS[Categoria.Ahorro],
        bucketId: BUCKET_IDS[Bucket.Ahorro],
      },
    });

    const summary = await runBackfill(prisma, { dryRun: false });

    const afterRun = await prisma.transaccion.findUnique({
      where: { id: tx.id },
    });
    expect(afterRun?.categoriaId).toBe(CATEGORIA_IDS[Categoria.Ahorro]);
    expect(afterRun?.bucketId).toBe(BUCKET_IDS[Bucket.Ahorro]);
    // This row was never in the totalRows scope for this run.
    expect(summary.totalRows).toBe(0);
  });

  // T3.4 — refuses to run without ALLOW_DESTRUCTIVE_DB=1 / rejects prod strings.
  // (Gate itself is fully unit-tested without a DB in
  // src/infrastructure/persistence/backfill-categorias.spec.ts; this
  // integration test only documents that the same gate guards main() in a
  // real-DB context, consistent with categorizacion.int-spec.ts's posture.)
  it('T3.4: main() se rehúsa a correr sin ALLOW_DESTRUCTIVE_DB=1 / con cadena de producción', async () => {
    const originalAllow = process.env.ALLOW_DESTRUCTIVE_DB;
    try {
      delete process.env.ALLOW_DESTRUCTIVE_DB;
      await expect(main([])).rejects.toThrow(/ALLOW_DESTRUCTIVE_DB/);
    } finally {
      process.env.ALLOW_DESTRUCTIVE_DB = originalAllow;
    }
  });

  // T3.5 — CAT037-05 "legacy backfill script cannot write across tenants"
  // (D-10): a non-bootstrap user's row is NEVER touched, even when its
  // description would otherwise match a bootstrap pattern.
  it('T3.5 (CAT037-05, D-10): el backfill NUNCA toca transacciones de otro usuario, aunque su descripcion matchee un patrón', async () => {
    const otherUserId = `backfill-other-${Date.now()}`;
    await prisma.user.create({
      data: { id: otherUserId, nombre: 'Other user (non-bootstrap)' },
    });
    const otherAccount = await prisma.account.create({
      data: {
        userId: otherUserId,
        banco: 'BancoEstado',
        tipoCuenta: 'CuentaRUT',
        numeroCuenta: `other-${Date.now()}`,
      },
    });
    const otherIngesta = await prisma.ingesta.create({
      data: {
        userId: otherUserId,
        accountId: otherAccount.id,
        banco: 'BancoEstado',
        nombreArchivo: 'other-backfill.xlsx',
        estado: 'PROCESADA',
      },
    });
    const otherTx = await prisma.transaccion.create({
      data: {
        ingestaId: otherIngesta.id,
        accountId: otherAccount.id,
        fecha: new Date('2026-07-01'),
        // Would match the bootstrap "lider" pattern if the backfill's scope
        // leaked across tenants — the exact defect D-10 exists to prevent.
        descripcion: 'Compra Lider',
        cargo: 9500n,
        abono: 0n,
      },
    });

    await runBackfill(prisma, { dryRun: false });

    const untouched = await prisma.transaccion.findUnique({
      where: { id: otherTx.id },
    });
    expect(untouched?.categoriaId).toBeNull();
    expect(untouched?.bucketId).toBeNull();

    await prisma.transaccion.deleteMany({
      where: { ingestaId: otherIngesta.id },
    });
    await prisma.ingesta.deleteMany({ where: { id: otherIngesta.id } });
    await prisma.account.deleteMany({ where: { id: otherAccount.id } });
    await prisma.user.deleteMany({ where: { id: otherUserId } });
  });

  // T3.6 (CAT037-05, D-10): the pattern-catalog READ must be scoped too, not
  // just the transaccion WRITE (T3.5). Mirrors the demonstrated exploit: an
  // unscoped `patronClasificacion.findMany()` merges EVERY user's patterns
  // into one prioridad-sorted list — an attacker who owns their own catalog
  // copy can repoint their own "lider" pattern to a different categoria with
  // a LOWER prioridad than the bootstrap's (10) and hijack what the
  // bootstrap user's own transactions resolve to.
  it('T3.6 (CAT037-05, D-10): un patrón secuestrado en el catálogo de OTRO usuario, con prioridad menor a la del bootstrap, nunca afecta la clasificación del usuario bootstrap', async () => {
    const attackerUserId = `backfill-hijack-${Date.now()}`;
    await prisma.user.create({
      data: { id: attackerUserId, nombre: 'Hijack probe user' },
    });
    await crearCatalogoParaUsuario(prisma, attackerUserId);

    try {
      const attackerAhorroCategoria = await prisma.categoria.findUniqueOrThrow({
        where: {
          userId_nombre: { userId: attackerUserId, nombre: Categoria.Ahorro },
        },
      });
      // Repoint the ATTACKER's OWN "lider" pattern (never the bootstrap's) to
      // a different categoria with a lower prioridad than the bootstrap's
      // "lider"→Supermercado pattern (prioridad 10, catalogo-template.ts).
      await prisma.patronClasificacion.updateMany({
        where: { userId: attackerUserId, patron: 'lider' },
        data: { categoriaId: attackerAhorroCategoria.id, prioridad: 1 },
      });

      await prisma.transaccion.create({
        data: {
          ingestaId: testIngestaId,
          accountId: ACCOUNT_ID_FIJO,
          fecha: new Date('2026-07-01'),
          descripcion: 'Compra Lider',
          cargo: 9500n,
          abono: 0n,
        },
      });

      const summary = await runBackfill(prisma, { dryRun: false });

      const bootstrapRow = await prisma.transaccion.findFirst({
        where: { ingestaId: testIngestaId, descripcion: 'Compra Lider' },
      });
      // Must still resolve via the BOOTSTRAP user's own catalog
      // (Supermercado), never the attacker's hijacked categoria (Ahorro).
      expect(bootstrapRow?.categoriaId).toBe(
        CATEGORIA_IDS[Categoria.Supermercado],
      );
      expect(
        summary.porCategoria[Categoria.Supermercado],
      ).toBeGreaterThanOrEqual(1);
    } finally {
      // Cleanup must run even when the assertions above fail (red phase or a
      // future regression), so the attacker rows never leak into the DB.
      await prisma.patronClasificacion.deleteMany({
        where: { userId: attackerUserId },
      });
      await prisma.categoria.deleteMany({ where: { userId: attackerUserId } });
      await prisma.user.deleteMany({ where: { id: attackerUserId } });
    }
  });
});
