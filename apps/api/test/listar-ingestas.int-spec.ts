import 'dotenv/config';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';
import { loadEnv } from '../src/config/env';
import { PrismaListarIngestasReader } from '../src/infrastructure/persistence/prisma-listar-ingestas.reader';
import { USER_ID_FIJO } from '../src/infrastructure/persistence/constants';

/**
 * Integration tests for PrismaListarIngestasReader (US-018, design.md §5.2)
 * — two-user pattern, mirrors eliminar-ingesta.int-spec.ts /
 * movimientos-mes.int-spec.ts.
 *
 * `GET /api/ingestas` returns per-user data (RNF-SEC-006). This is the
 * cross-tenant isolation gap flagged by fresh-context review: the reader had
 * only a mocked unit test (prisma-listar-ingestas.reader.spec.ts), unlike
 * every sibling read endpoint. Asserts user A's results NEVER include user
 * B's ingesta id.
 *
 * Requires a live dev DB with ALLOW_DESTRUCTIVE_DB=1 — run via
 * `pnpm api test:integration` (vitest.int.config.ts, which only includes
 * `test/**\/*.int-spec.ts` and gates via `test/integration.setup.ts` →
 * `assertDestructiveDbAllowed()`). It is intentionally EXCLUDED from
 * `pnpm api test` (vitest.config.ts only includes `src/**\/*.spec.ts`) — same
 * posture as eliminar-ingesta.int-spec.ts and the rest of the
 * `test/*.int-spec.ts` suite (ADR-028 debt: local disposable Postgres not yet
 * provisioned, see apps/api/docs/local-test-db.md). NOT executed in this
 * apply session for that reason — written and committed now, green run is
 * gated on a human provisioning the local DB.
 */

const RUN_ID = `listaringint-${Date.now()}`;

const TEST_USER_ID_A = `${USER_ID_FIJO}-${RUN_ID}`;
const TEST_USER_ID_B = `user-b-${RUN_ID}`;

describe('PrismaListarIngestasReader (integration — real dev DB)', () => {
  const prisma = createPrismaClient(loadEnv());
  const reader = new PrismaListarIngestasReader(prisma);

  let accountIdA: string;
  let accountIdB: string;

  beforeAll(async () => {
    await prisma.$connect();

    await prisma.user.create({
      data: { id: TEST_USER_ID_A, nombre: `Test User A ${RUN_ID}` },
    });
    await prisma.user.create({
      data: { id: TEST_USER_ID_B, nombre: `Test User B ${RUN_ID}` },
    });

    const accA = await prisma.account.create({
      data: {
        userId: TEST_USER_ID_A,
        banco: 'BCI',
        tipoCuenta: 'Cuenta Corriente',
        numeroCuenta: `bci-a-${RUN_ID}`,
      },
    });
    accountIdA = accA.id;

    const accB = await prisma.account.create({
      data: {
        userId: TEST_USER_ID_B,
        banco: 'Santander',
        tipoCuenta: 'Cuenta Corriente',
        numeroCuenta: `san-b-${RUN_ID}`,
      },
    });
    accountIdB = accB.id;
  });

  afterAll(async () => {
    await prisma.transaccion.deleteMany({
      where: { accountId: { in: [accountIdA, accountIdB] } },
    });
    await prisma.ingesta.deleteMany({
      where: { accountId: { in: [accountIdA, accountIdB] } },
    });
    await prisma.account.deleteMany({
      where: { id: { in: [accountIdA, accountIdB] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [TEST_USER_ID_A, TEST_USER_ID_B] } },
    });
    await prisma.$disconnect();
  });

  const createIngesta = (
    accountId: string,
    nombreArchivo: string,
    estado: 'PENDIENTE' | 'PROCESADA' | 'FALLIDA',
    totalTransacciones: number,
  ) =>
    prisma.ingesta.create({
      data: {
        accountId,
        banco: accountId === accountIdA ? 'BCI' : 'Santander',
        nombreArchivo,
        estado,
        totalTransacciones,
      },
    });

  // -------------------------------------------------------------------------
  // Isolation — the point of this file (RNF-SEC-006)
  // -------------------------------------------------------------------------
  it('ISO: user A results NEVER include user B ingesta id', async () => {
    const ingA = await createIngesta(
      accountIdA,
      `a-${RUN_ID}.xlsx`,
      'PROCESADA',
      2,
    );
    const ingB = await createIngesta(
      accountIdB,
      `b-${RUN_ID}.xlsx`,
      'PROCESADA',
      3,
    );

    const resultA = await reader.listarPorUsuario(TEST_USER_ID_A);

    const returnedIds = resultA.map((r) => r.id);
    expect(returnedIds).toContain(ingA.id);
    expect(returnedIds).not.toContain(ingB.id);
  });

  // -------------------------------------------------------------------------
  // PROCESADA filter (design.md §5.2, D5)
  // -------------------------------------------------------------------------
  it('filters out non-PROCESADA ingestas (PENDIENTE/FALLIDA) for the same user', async () => {
    const ingProcesada = await createIngesta(
      accountIdA,
      `a-ok-${RUN_ID}.xlsx`,
      'PROCESADA',
      1,
    );
    const ingPendiente = await createIngesta(
      accountIdA,
      `a-pendiente-${RUN_ID}.xlsx`,
      'PENDIENTE',
      0,
    );
    const ingFallida = await createIngesta(
      accountIdA,
      `a-fallida-${RUN_ID}.xlsx`,
      'FALLIDA',
      0,
    );

    const resultA = await reader.listarPorUsuario(TEST_USER_ID_A);
    const returnedIds = resultA.map((r) => r.id);

    expect(returnedIds).toContain(ingProcesada.id);
    expect(returnedIds).not.toContain(ingPendiente.id);
    expect(returnedIds).not.toContain(ingFallida.id);
  });

  // -------------------------------------------------------------------------
  // Shape + count
  // -------------------------------------------------------------------------
  it('returns rows shaped as { id, banco, fecha, totalTransacciones } with the correct count', async () => {
    const ing = await createIngesta(
      accountIdA,
      `a-shape-${RUN_ID}.xlsx`,
      'PROCESADA',
      7,
    );

    const resultA = await reader.listarPorUsuario(TEST_USER_ID_A);
    const found = resultA.find((r) => r.id === ing.id);

    expect(found).toBeDefined();
    expect(found).toEqual(
      expect.objectContaining({
        id: ing.id,
        banco: 'BCI',
        totalTransacciones: 7,
      }),
    );
    expect(found!.fecha).toBeInstanceOf(Date);
  });

  // -------------------------------------------------------------------------
  // Ordering — desc by creadoEn
  // -------------------------------------------------------------------------
  it('orders results by creadoEn desc (most recent ingesta first)', async () => {
    const older = await createIngesta(
      accountIdA,
      `a-older-${RUN_ID}.xlsx`,
      'PROCESADA',
      1,
    );
    // creadoEn defaults to now() at insert time — a short delay guarantees
    // strict ordering without relying on clock resolution.
    await new Promise((resolve) => setTimeout(resolve, 10));
    const newer = await createIngesta(
      accountIdA,
      `a-newer-${RUN_ID}.xlsx`,
      'PROCESADA',
      1,
    );

    const resultA = await reader.listarPorUsuario(TEST_USER_ID_A);
    const olderIdx = resultA.findIndex((r) => r.id === older.id);
    const newerIdx = resultA.findIndex((r) => r.id === newer.id);

    expect(newerIdx).toBeLessThan(olderIdx);
  });
});
