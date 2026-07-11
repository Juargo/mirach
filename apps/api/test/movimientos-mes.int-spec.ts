import 'dotenv/config';
import { PrismaService } from '../src/infrastructure/persistence/prisma.service';
import { PrismaMovimientosMesRepository } from '../src/infrastructure/persistence/prisma-movimientos-mes.repository';
import { PeriodoMes } from '../src/domain/value-objects/periodo-mes';
import { USER_ID_FIJO } from '../src/infrastructure/persistence/constants';

/**
 * Integration tests for PrismaMovimientosMesRepository (US-014).
 *
 * Requires a live dev DB with ALLOW_DESTRUCTIVE_DB=1.
 * Uses a RUN_ID to isolate test data and cleans up in afterAll.
 *
 * Key scenarios:
 *   CA-01: multi-bank consolidation (rows from 2+ accounts returned)
 *   CA-02: per-movement bank origin fields present
 *   CA-03: UTC calendar-month boundary (desde inclusive, hasta exclusive)
 *   AC-04: empty month returns []
 *   AC-08: money exactness — BigInt > MAX_SAFE_INTEGER survives round-trip
 *   AC-10: user isolation — second user's rows never appear
 *   Ordering: fecha asc, id asc tiebreak
 */

const RUN_ID = `movmesint-${Date.now()}`;

// Use a unique userId per run to keep test data isolated.
// USER_ID_FIJO is used for the primary user; a second user is created for isolation test.
const TEST_USER_ID = `${USER_ID_FIJO}-${RUN_ID}`;
const TEST_USER_ID_B = `user-b-${RUN_ID}`;

describe('PrismaMovimientosMesRepository (integration — real dev DB)', () => {
  const prisma = new PrismaService();
  const repo = new PrismaMovimientosMesRepository(prisma);

  let accountIdA1: string;   // user A, bank 1 (BancoEstado)
  let accountIdA2: string;   // user A, bank 2 (BCI)
  let accountIdB: string;    // user B (for isolation test)
  let ingestaIdA1: string;
  let ingestaIdA2: string;
  let ingestaIdB: string;

  // Periodo used throughout: July 2026
  const periodoJulio = PeriodoMes.crear('2026-07').getValue();
  const periodoMayo = PeriodoMes.crear('2026-05').getValue();

  beforeAll(async () => {
    await prisma.$connect();

    // Create user A and user B
    await prisma.user.create({ data: { id: TEST_USER_ID, nombre: `Test User A ${RUN_ID}` } });
    await prisma.user.create({ data: { id: TEST_USER_ID_B, nombre: `Test User B ${RUN_ID}` } });

    // Accounts for user A
    const accA1 = await prisma.account.create({
      data: {
        userId: TEST_USER_ID,
        banco: 'BancoEstado',
        tipoCuenta: 'CuentaRUT',
        numeroCuenta: `rut-${RUN_ID}`,
      },
    });
    accountIdA1 = accA1.id;

    const accA2 = await prisma.account.create({
      data: {
        userId: TEST_USER_ID,
        banco: 'BCI',
        tipoCuenta: 'Cuenta Corriente',
        numeroCuenta: `bci-${RUN_ID}`,
      },
    });
    accountIdA2 = accA2.id;

    // Account for user B
    const accB = await prisma.account.create({
      data: {
        userId: TEST_USER_ID_B,
        banco: 'Santander',
        tipoCuenta: 'Cuenta Corriente',
        numeroCuenta: `san-${RUN_ID}`,
      },
    });
    accountIdB = accB.id;

    // Ingestas (required as FK for Transaccion)
    const ingA1 = await prisma.ingesta.create({
      data: {
        accountId: accountIdA1,
        banco: 'BancoEstado',
        nombreArchivo: `be-${RUN_ID}.xlsx`,
        estado: 'PROCESADA',
      },
    });
    ingestaIdA1 = ingA1.id;

    const ingA2 = await prisma.ingesta.create({
      data: {
        accountId: accountIdA2,
        banco: 'BCI',
        nombreArchivo: `bci-${RUN_ID}.xlsx`,
        estado: 'PROCESADA',
      },
    });
    ingestaIdA2 = ingA2.id;

    const ingB = await prisma.ingesta.create({
      data: {
        accountId: accountIdB,
        banco: 'Santander',
        nombreArchivo: `san-${RUN_ID}.xlsx`,
        estado: 'PROCESADA',
      },
    });
    ingestaIdB = ingB.id;
  });

  afterAll(async () => {
    // Clean up in FK-inverse order
    await prisma.transaccion.deleteMany({
      where: { ingestaId: { in: [ingestaIdA1, ingestaIdA2, ingestaIdB] } },
    });
    await prisma.ingesta.deleteMany({
      where: { id: { in: [ingestaIdA1, ingestaIdA2, ingestaIdB] } },
    });
    await prisma.account.deleteMany({
      where: { id: { in: [accountIdA1, accountIdA2, accountIdB] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [TEST_USER_ID, TEST_USER_ID_B] } },
    });
    await prisma.$disconnect();
  });

  // Helper to create a transaction
  const createTx = (accountId: string, ingestaId: string, fecha: Date, cargo: bigint, abono: bigint, descripcion = 'Test tx') =>
    prisma.transaccion.create({
      data: { accountId, ingestaId, fecha, cargo, abono, descripcion },
    });

  it('CA-01/CA-02: returns all July rows from 2 banks with banco/tipoCuenta/numeroCuenta fields', async () => {
    const tx1 = await createTx(accountIdA1, ingestaIdA1, new Date('2026-07-10T00:00:00.000Z'), 30000n, 0n, 'Compra A1');
    const tx2 = await createTx(accountIdA2, ingestaIdA2, new Date('2026-07-15T00:00:00.000Z'), 50000n, 0n, 'Compra A2');

    const rows = await repo.findByPeriodo(TEST_USER_ID, periodoJulio);

    expect(rows.length).toBeGreaterThanOrEqual(2);
    const r1 = rows.find((r) => r.id === tx1.id);
    const r2 = rows.find((r) => r.id === tx2.id);

    expect(r1).toBeDefined();
    expect(r1!.banco).toBe('BancoEstado');
    expect(r1!.tipoCuenta).toBe('CuentaRUT');
    expect(r1!.numeroCuenta).toBe(`rut-${RUN_ID}`);

    expect(r2).toBeDefined();
    expect(r2!.banco).toBe('BCI');
    expect(r2!.tipoCuenta).toBe('Cuenta Corriente');
    expect(r2!.numeroCuenta).toBe(`bci-${RUN_ID}`);
  });

  it('CA-03: row at desde (2026-07-01T00:00:00.000Z) is INCLUDED; row at hasta (2026-08-01) is EXCLUDED', async () => {
    const txFirst = await createTx(accountIdA1, ingestaIdA1, new Date('2026-07-01T00:00:00.000Z'), 1000n, 0n, 'First of July');
    const txAug = await createTx(accountIdA1, ingestaIdA1, new Date('2026-08-01T00:00:00.000Z'), 2000n, 0n, 'First of August');

    const rows = await repo.findByPeriodo(TEST_USER_ID, periodoJulio);

    const ids = rows.map((r) => r.id);
    expect(ids).toContain(txFirst.id);
    expect(ids).not.toContain(txAug.id);
  });

  it('AC-04: empty month returns []', async () => {
    const rows = await repo.findByPeriodo(TEST_USER_ID, periodoMayo);
    expect(rows).toEqual([]);
  });

  it('ordering: rows ordered by fecha asc then id asc as tiebreak', async () => {
    // Self-contained: use a dedicated period (2026-06) and a dedicated account so
    // results are unaffected by rows seeded in other tests.
    const ORDER_USER_ID = `${USER_ID_FIJO}-order-${RUN_ID}`;
    const periodoJunio = PeriodoMes.crear('2026-06').getValue();

    await prisma.user.create({ data: { id: ORDER_USER_ID, nombre: `Order User ${RUN_ID}` } });

    const orderAccount = await prisma.account.create({
      data: {
        userId: ORDER_USER_ID,
        banco: 'BCI',
        tipoCuenta: 'Cuenta Corriente',
        numeroCuenta: `order-${RUN_ID}`,
      },
    });

    const orderIngesta = await prisma.ingesta.create({
      data: {
        accountId: orderAccount.id,
        banco: 'BCI',
        nombreArchivo: `order-${RUN_ID}.xlsx`,
        estado: 'PROCESADA',
      },
    });

    // Clean up order-specific data after this test's afterAll (piggyback cleanup)
    // by using a try/finally block — or capture IDs for the parent afterAll.
    // We use a nested try/finally for self-containment.
    try {
      // Three rows: earlier date, later date, SAME date as txEarlier (tiebreak pair)
      const txEarlier = await prisma.transaccion.create({
        data: {
          accountId: orderAccount.id,
          ingestaId: orderIngesta.id,
          fecha: new Date('2026-06-05T00:00:00.000Z'),
          cargo: 200n,
          abono: 0n,
          descripcion: 'Earlier',
        },
      });

      // Same fecha as txEarlier — must come AFTER it because its id will be > txEarlier.id
      const txSameDate = await prisma.transaccion.create({
        data: {
          accountId: orderAccount.id,
          ingestaId: orderIngesta.id,
          fecha: new Date('2026-06-05T00:00:00.000Z'),
          cargo: 150n,
          abono: 0n,
          descripcion: 'SameDate',
        },
      });

      const txLater = await prisma.transaccion.create({
        data: {
          accountId: orderAccount.id,
          ingestaId: orderIngesta.id,
          fecha: new Date('2026-06-20T00:00:00.000Z'),
          cargo: 100n,
          abono: 0n,
          descripcion: 'Later',
        },
      });

      const rows = await repo.findByPeriodo(ORDER_USER_ID, periodoJunio);

      expect(rows.length).toBe(3);

      const earlierIdx = rows.findIndex((r) => r.id === txEarlier.id);
      const sameDateIdx = rows.findIndex((r) => r.id === txSameDate.id);
      const laterIdx = rows.findIndex((r) => r.id === txLater.id);

      // fecha asc: earlier (2026-06-05) before later (2026-06-20)
      expect(earlierIdx).toBeLessThan(laterIdx);
      // id asc tiebreak: txEarlier.id < txSameDate.id (both on 2026-06-05)
      expect(earlierIdx).toBeLessThan(sameDateIdx);
      // same-date pair both before the later-date row
      expect(sameDateIdx).toBeLessThan(laterIdx);
    } finally {
      await prisma.transaccion.deleteMany({ where: { ingestaId: orderIngesta.id } });
      await prisma.ingesta.delete({ where: { id: orderIngesta.id } });
      await prisma.account.delete({ where: { id: orderAccount.id } });
      await prisma.user.delete({ where: { id: ORDER_USER_ID } });
    }
  });

  it('AC-08: money exactness — cargo > MAX_SAFE_INTEGER is returned as exact bigint', async () => {
    const bigAmount = 9007199254740993n; // 2^53 + 1
    const tx = await createTx(accountIdA1, ingestaIdA1, new Date('2026-07-25T00:00:00.000Z'), bigAmount, 0n, 'BigInt test');

    const rows = await repo.findByPeriodo(TEST_USER_ID, periodoJulio);

    const found = rows.find((r) => r.id === tx.id);
    expect(found).toBeDefined();
    expect(found!.cargo).toBe(bigAmount);
    expect(typeof found!.cargo).toBe('bigint');
  });

  it('AC-10 (user isolation): user B transactions in July NEVER appear in user A results', async () => {
    // Seed a user B transaction in July and capture its id
    const userBTx = await createTx(accountIdB, ingestaIdB, new Date('2026-07-12T00:00:00.000Z'), 99000n, 0n, 'UserB tx');

    const rows = await repo.findByPeriodo(TEST_USER_ID, periodoJulio);

    // Assert by transaction identity — the specific seeded user-B tx must not appear.
    // This is stronger than checking numeroCuenta (an incidental field) because it
    // verifies isolation at the row-identity level regardless of account attributes.
    const returnedIds = rows.map((r) => r.id);
    expect(returnedIds).not.toContain(userBTx.id);
  });

  it('bucketId is null when transaction has no bucket assigned', async () => {
    const tx = await createTx(accountIdA1, ingestaIdA1, new Date('2026-07-28T00:00:00.000Z'), 5000n, 0n, 'No bucket');

    const rows = await repo.findByPeriodo(TEST_USER_ID, periodoJulio);
    const found = rows.find((r) => r.id === tx.id);
    expect(found).toBeDefined();
    expect(found!.bucketId).toBeNull();
  });
});
