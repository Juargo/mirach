import 'dotenv/config';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';
import { loadEnv } from '../src/config/env';
import { PrismaEliminarIngestaRepository } from '../src/infrastructure/persistence/prisma-eliminar-ingesta.repository';
import { IngestaNoEncontradaError } from '../src/domain/errors/ingesta-no-encontrada.error';
import { USER_ID_FIJO } from '../src/infrastructure/persistence/constants';

/**
 * Integration tests for PrismaEliminarIngestaRepository (US-018 §3.1/§3.2/
 * §8.3, hardened post-4R-review for US-004 D8) — two-user pattern, mirrors
 * reclasificar-categoria.int-spec.ts.
 *
 * THIS IS THE KEY CORRECTNESS TEST (design.md §3.2): the ISO case catches the
 * cross-tenant child-deleteMany bug a naive `{ ingestaId }` (unscoped) clause
 * would introduce — it would pass a "404 to the attacker" assertion while
 * silently deleting the victim's transacciones. Asserting only the attacker's
 * response status is NOT enough; this file also asserts the VICTIM's rows are
 * untouched.
 *
 * Post-US-004 hardening (T1.15e): also proves that a FALLIDA ingesta owned
 * by the requesting user is NOT deletable — this is now an EXPLICIT
 * `estado: PROCESADA` gate in the repository's WHERE clauses, not an
 * accident of the old `account: { userId }` join (FALLIDA rows have
 * `accountId = null`, so that join never matched them either — same
 * observable 404, different and now deliberate reason).
 *
 * Requires a live Postgres reachable via `.env.test` — run via
 * `pnpm --filter @moneydiary/api test:integration` against the local
 * disposable Postgres (localhost:5432, seeded, ADR-029/apps/api/docs/local-test-db.md).
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
    // Scoped by userId (not accountId): a FALLIDA fixture (T1.15e) has
    // accountId = null and would otherwise survive cleanup and block the
    // subsequent user delete under the required Ingesta.userId FK.
    await prisma.ingesta.deleteMany({
      where: { userId: { in: [TEST_USER_ID_A, TEST_USER_ID_B] } },
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
        userId: accountId === accountIdA ? TEST_USER_ID_A : TEST_USER_ID_B,
        accountId,
        banco: accountId === accountIdA ? 'BCI' : 'Santander',
        nombreArchivo,
        estado: 'PROCESADA',
        totalTransacciones: 0,
      },
    });

  const createIngestaFallida = (userId: string, nombreArchivo: string) =>
    prisma.ingesta.create({
      data: {
        userId,
        accountId: null,
        banco: null,
        nombreArchivo,
        estado: 'FALLIDA',
        motivoFallo: 'Extensión de archivo no soportada',
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
  // (now via the direct Ingesta.userId column, post-US-004 hardening)
  // -------------------------------------------------------------------------
  it('T1.15a (ISO): user A cannot delete user B PROCESADA ingesta — Result.fail AND B rows untouched (catches §3.2, direct userId)', async () => {
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
  // 4R-review hardening: FALLIDA is explicitly not deletable (D8), not an
  // accident of the old account-join miss.
  // -------------------------------------------------------------------------
  it('T1.15e: a FALLIDA ingesta owned by the requesting user is NOT deletable — Result.fail (explicit estado gate, D8)', async () => {
    const ingFallida = await createIngestaFallida(
      TEST_USER_ID_A,
      `fallida-${RUN_ID}.xlsx`,
    );

    const result = await repo.eliminarConTransacciones(
      TEST_USER_ID_A,
      ingFallida.id,
    );

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(IngestaNoEncontradaError);

    // The FALLIDA row MUST still exist — it was never targeted.
    const ingestaAun = await prisma.ingesta.findUnique({
      where: { id: ingFallida.id },
    });
    expect(ingestaAun).not.toBeNull();
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
