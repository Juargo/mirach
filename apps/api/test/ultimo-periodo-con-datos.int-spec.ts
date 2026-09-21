import 'dotenv/config';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';
import { loadEnv } from '../src/config/env';
import { PrismaUltimoPeriodoConDatosReader } from '../src/infrastructure/persistence/prisma-ultimo-periodo-con-datos.repository';
import { USER_ID_FIJO } from '../src/infrastructure/persistence/constants';

/**
 * Integration tests for PrismaUltimoPeriodoConDatosReader (issue #747),
 * two-user pattern — mirrors detalle-bucket.int-spec.ts's isolation test.
 *
 * Requires a live dev DB with ALLOW_DESTRUCTIVE_DB=1. Uses a RUN_ID to
 * isolate test data and cleans up in afterAll.
 *
 * Key scenario (ADR-015 mandate on user_id isolation for every endpoint
 * returning user data): user A's transactions live in 2026-03, user B's in
 * 2026-08 — resolving A's "latest period with data" must NEVER see B's
 * later month, and vice versa.
 */

const RUN_ID = `ultimoperiodoint-${Date.now()}`;

const TEST_USER_ID_A = `${USER_ID_FIJO}-${RUN_ID}`;
const TEST_USER_ID_B = `user-b-${RUN_ID}`;
const TEST_USER_ID_C = `user-c-${RUN_ID}`; // sin ninguna transacción

describe('PrismaUltimoPeriodoConDatosReader (integration — real dev DB)', () => {
  const prisma = createPrismaClient(loadEnv());
  const repo = new PrismaUltimoPeriodoConDatosReader(prisma);

  let accountIdA: string;
  let accountIdB: string;
  let ingestaIdA: string;
  let ingestaIdB: string;

  beforeAll(async () => {
    await prisma.$connect();

    await prisma.user.create({
      data: { id: TEST_USER_ID_A, nombre: `Test User A ${RUN_ID}` },
    });
    await prisma.user.create({
      data: { id: TEST_USER_ID_B, nombre: `Test User B ${RUN_ID}` },
    });
    await prisma.user.create({
      data: { id: TEST_USER_ID_C, nombre: `Test User C ${RUN_ID}` },
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

    const ingA = await prisma.ingesta.create({
      data: {
        userId: TEST_USER_ID_A,
        accountId: accountIdA,
        banco: 'BCI',
        nombreArchivo: `a-${RUN_ID}.xlsx`,
        estado: 'PROCESADA',
      },
    });
    ingestaIdA = ingA.id;

    const ingB = await prisma.ingesta.create({
      data: {
        userId: TEST_USER_ID_B,
        accountId: accountIdB,
        banco: 'Santander',
        nombreArchivo: `b-${RUN_ID}.xlsx`,
        estado: 'PROCESADA',
      },
    });
    ingestaIdB = ingB.id;

    // Usuario A: transacciones en 2026-01 y 2026-03 (la más reciente).
    await prisma.transaccion.create({
      data: {
        accountId: accountIdA,
        ingestaId: ingestaIdA,
        fecha: new Date('2026-01-10T00:00:00.000Z'),
        cargo: 10000n,
        abono: 0n,
        descripcion: 'A - enero',
      },
    });
    await prisma.transaccion.create({
      data: {
        accountId: accountIdA,
        ingestaId: ingestaIdA,
        fecha: new Date('2026-03-20T23:59:59.999Z'),
        cargo: 20000n,
        abono: 0n,
        descripcion: 'A - marzo (mas reciente)',
      },
    });

    // Usuario B: una transacción en 2026-08 — MES POSTERIOR al de A.
    await prisma.transaccion.create({
      data: {
        accountId: accountIdB,
        ingestaId: ingestaIdB,
        fecha: new Date('2026-08-05T00:00:00.000Z'),
        cargo: 0n,
        abono: 500000n,
        descripcion: 'B - agosto',
      },
    });

    // Usuario C: sin ninguna transacción (creado arriba, nunca poblado).
  });

  afterAll(async () => {
    await prisma.transaccion.deleteMany({
      where: { ingestaId: { in: [ingestaIdA, ingestaIdB] } },
    });
    await prisma.ingesta.deleteMany({
      where: { id: { in: [ingestaIdA, ingestaIdB] } },
    });
    await prisma.account.deleteMany({
      where: { id: { in: [accountIdA, accountIdB] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [TEST_USER_ID_A, TEST_USER_ID_B, TEST_USER_ID_C] } },
    });
    await prisma.$disconnect();
  });

  it('resuelve el ÚLTIMO mes del usuario con datos (2026-03, no 2026-01)', async () => {
    const result = await repo.ultimoPeriodoConDatos(TEST_USER_ID_A);

    expect(result?.valor).toBe('2026-03');
  });

  it('isolation (RNF-SEC-006): el mes de un usuario NUNCA ve las transacciones de otro usuario', async () => {
    // Usuario B tiene datos en 2026-08 — un mes POSTERIOR al de A. Si el
    // filtro de userId se rompiera (p. ej. quedara sin scoping estructural),
    // A "vería" el mes de B y este assert fallaría.
    const resultA = await repo.ultimoPeriodoConDatos(TEST_USER_ID_A);
    const resultB = await repo.ultimoPeriodoConDatos(TEST_USER_ID_B);

    expect(resultA?.valor).toBe('2026-03');
    expect(resultB?.valor).toBe('2026-08');
  });

  it('usuario sin ninguna transacción → null', async () => {
    const result = await repo.ultimoPeriodoConDatos(TEST_USER_ID_C);

    expect(result).toBeNull();
  });

  it('usuario inexistente → null (sin lanzar)', async () => {
    const result = await repo.ultimoPeriodoConDatos(
      `usuario-que-no-existe-${RUN_ID}`,
    );

    expect(result).toBeNull();
  });
});
