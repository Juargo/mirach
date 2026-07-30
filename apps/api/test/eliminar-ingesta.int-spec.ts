import 'dotenv/config';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';
import { loadEnv } from '../src/config/env';
import { PrismaEliminarIngestaRepository } from '../src/infrastructure/persistence/prisma-eliminar-ingesta.repository';
import { IngestaNoEncontradaError } from '../src/domain/errors/ingesta-no-encontrada.error';
import { USER_ID_FIJO } from '../src/infrastructure/persistence/constants';

/**
 * Integration tests for PrismaEliminarIngestaRepository (US-018, design.md
 * §3.1/§3.2/§8.3) — two-user pattern, mirrors reclasificar-categoria.int-spec.ts.
 *
 * THIS IS THE KEY CORRECTNESS TEST (design.md §3.2): the ISO case catches the
 * cross-tenant child-deleteMany bug a naive `{ ingestaId }` (unscoped) clause
 * would introduce — it would pass a "404 to the attacker" assertion while
 * silently deleting the victim's transacciones. Asserting only the attacker's
 * response status is NOT enough; this file also asserts the VICTIM's rows are
 * untouched.
 *
 * Requires a live dev DB with ALLOW_DESTRUCTIVE_DB=1 — run via
 * `pnpm api test:integration` (vitest.int.config.ts, which only includes
 * `test/**\/*.int-spec.ts` and gates via `test/integration.setup.ts` →
 * `assertDestructiveDbAllowed()`). It is intentionally EXCLUDED from
 * `pnpm api test` (vitest.config.ts only includes `src/**\/*.spec.ts`) — same
 * posture as reclasificar-categoria.int-spec.ts and the rest of the
 * `test/*.int-spec.ts` suite (ADR-028 debt: local disposable Postgres not yet
 * provisioned, see apps/api/docs/local-test-db.md). NOT executed in this
 * apply session for that reason — written and committed now, green run is
 * gated on a human provisioning the local DB.
 */

const RUN_ID = `eliminaringint-${Date.now()}`;

const TEST_USER_ID_A = `${USER_ID_FIJO}-${RUN_ID}`;
const TEST_USER_ID_B = `user-b-${RUN_ID}`;

describe('PrismaEliminarIngestaRepository (integration — real dev DB)', () => {
  const prisma = createPrismaClient(loadEnv());
  const repo = new PrismaEliminarIngestaRepository(prisma);

  let accountIdA: string;
  let accountIdB: string;

  const FECHA = new Date('2026-07-15T00:00:00.000Z');

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

  const createIngesta = (accountId: string, nombreArchivo: string) =>
    prisma.ingesta.create({
      data: {
        accountId,
        banco: accountId === accountIdA ? 'BCI' : 'Santander',
        nombreArchivo,
        estado: 'PROCESADA',
        totalTransacciones: 0,
      },
    });

  const createTx = (accountId: string, ingestaId: string, cargo: bigint) =>
    prisma.transaccion.create({
      data: {
        accountId,
        ingestaId,
        fecha: FECHA,
        cargo,
        abono: 0n,
        descripcion: 'Test tx',
      },
    });

  // -------------------------------------------------------------------------
  // §3.2 — THE trap: cross-tenant isolation, catches the unscoped-child bug
  // -------------------------------------------------------------------------
  it('T1.15a (ISO): user A cannot delete user B ingesta — Result.fail AND B rows untouched (catches §3.2)', async () => {
    const ingB = await createIngesta(accountIdB, `b-${RUN_ID}.xlsx`);
    await createTx(accountIdB, ingB.id, 10000n);
    await createTx(accountIdB, ingB.id, 20000n);

    const result = await repo.eliminarConTransacciones(TEST_USER_ID_A, ingB.id);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(IngestaNoEncontradaError);

    // The victim's Ingesta row MUST still exist.
    const ingestaAun = await prisma.ingesta.findUnique({
      where: { id: ingB.id },
    });
    expect(ingestaAun).not.toBeNull();

    // The victim's Transaccion rows MUST be unchanged (this is the assertion
    // a naive unscoped-child implementation FAILS even though it passes the
    // "attacker gets 404" check above).
    const count = await prisma.transaccion.count({
      where: { ingestaId: ingB.id },
    });
    expect(count).toBe(2);
  });

  // -------------------------------------------------------------------------
  // Own delete
  // -------------------------------------------------------------------------
  it('T1.15b: user A deletes their own ingesta — Result.ok, row gone, tx count 0', async () => {
    const ingA = await createIngesta(accountIdA, `a-own-${RUN_ID}.xlsx`);
    await createTx(accountIdA, ingA.id, 5000n);
    await createTx(accountIdA, ingA.id, 7000n);

    const result = await repo.eliminarConTransacciones(TEST_USER_ID_A, ingA.id);

    expect(result.isOk()).toBe(true);

    const ingestaGone = await prisma.ingesta.findUnique({
      where: { id: ingA.id },
    });
    expect(ingestaGone).toBeNull();

    const count = await prisma.transaccion.count({
      where: { ingestaId: ingA.id },
    });
    expect(count).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Idempotent double-delete
  // -------------------------------------------------------------------------
  it('T1.15c: deleting the same id twice — second call → IngestaNoEncontradaError (parent count 0)', async () => {
    const ingA = await createIngesta(accountIdA, `a-double-${RUN_ID}.xlsx`);
    await createTx(accountIdA, ingA.id, 1000n);

    const first = await repo.eliminarConTransacciones(TEST_USER_ID_A, ingA.id);
    expect(first.isOk()).toBe(true);

    const second = await repo.eliminarConTransacciones(TEST_USER_ID_A, ingA.id);
    expect(second.isFail()).toBe(true);
    expect(second.getError()).toBeInstanceOf(IngestaNoEncontradaError);
  });

  // -------------------------------------------------------------------------
  // Empty ingesta
  // -------------------------------------------------------------------------
  it('T1.15d: an empty PROCESADA ingesta (0 transacciones) deletes cleanly — Result.ok', async () => {
    const ingA = await createIngesta(accountIdA, `a-empty-${RUN_ID}.xlsx`);

    const result = await repo.eliminarConTransacciones(TEST_USER_ID_A, ingA.id);

    expect(result.isOk()).toBe(true);

    const ingestaGone = await prisma.ingesta.findUnique({
      where: { id: ingA.id },
    });
    expect(ingestaGone).toBeNull();
  });
});
