import 'dotenv/config';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';
import { loadEnv } from '../src/config/env';
import { PrismaRevertirIngestaFallidaRepository } from '../src/infrastructure/persistence/prisma-revertir-ingesta-fallida.repository';
import { USER_ID_FIJO } from '../src/infrastructure/persistence/constants';

/**
 * Integration tests for PrismaRevertirIngestaFallidaRepository (issue #778
 * tramo 5a-bis) — two-user pattern, mirrors `eliminar-ingesta.int-spec.ts`.
 *
 * ESTE es el test del tramo (ver prompt de la tarea): prueba, contra una
 * Postgres real, que cuando el WRITER de categorización falla la ingesta se
 * REVIERTE de punta a punta — cero transacciones sobreviven y la `Ingesta`
 * queda FALLIDA, nunca "PROCESADA con bucketId nulo".
 *
 * También prueba el mismo par de traps de aislamiento que
 * `eliminar-ingesta.int-spec.ts`:
 *   - cross-tenant (T-REV-b): un `userId` ajeno NO puede revertir la
 *     ingesta de otro usuario — Result.fail Y las filas de la víctima
 *     quedan intactas.
 *   - cross-ingesta (T-REV-c): revertir la ingesta ACTUAL de un usuario NO
 *     toca las transacciones de una ingesta ANTERIOR del MISMO usuario.
 *
 * Requires a live Postgres reachable via `.env.test` — run via
 * `pnpm --filter @moneydiary/api test:integration` against the local
 * disposable Postgres (localhost:5432, seeded, ADR-029/apps/api/docs/local-test-db.md).
 */

const RUN_ID = `revertiringint-${Date.now()}`;

const TEST_USER_ID_A = `${USER_ID_FIJO}-${RUN_ID}`;
const TEST_USER_ID_B = `user-b-${RUN_ID}`;

describe('PrismaRevertirIngestaFallidaRepository (integration — real dev DB)', () => {
  const prisma = createPrismaClient(loadEnv());
  const repo = new PrismaRevertirIngestaFallidaRepository(prisma);

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
  // EL test del tramo — happy path de reversión completa
  // -------------------------------------------------------------------------
  it('T-REV-a: writer falla ⇒ Result.ok de la reversión, CERO transacciones quedan en BD, Ingesta queda FALLIDA', async () => {
    const ing = await createIngesta(accountIdA, `a-revert-${RUN_ID}.xlsx`);
    await createTx(accountIdA, ing.id, 8103n);
    await createTx(accountIdA, ing.id, 15000n);

    const preCount = await prisma.transaccion.count({
      where: { ingestaId: ing.id },
    });
    expect(preCount).toBe(2);

    const result = await repo.revertirYMarcarFallida(
      TEST_USER_ID_A,
      ing.id,
      'el writer de categorización falló',
    );

    expect(result.isOk()).toBe(true);

    // Cero transacciones sobreviven para ESTA ingesta.
    const postCount = await prisma.transaccion.count({
      where: { ingestaId: ing.id },
    });
    expect(postCount).toBe(0);

    // La Ingesta NO se borra — se preserva historial + el id, ahora FALLIDA.
    const ingestaFallida = await prisma.ingesta.findUnique({
      where: { id: ing.id },
    });
    expect(ingestaFallida).not.toBeNull();
    expect(ingestaFallida?.estado).toBe('FALLIDA');
    expect(ingestaFallida?.motivoFallo).toBe(
      'el writer de categorización falló',
    );
  });

  // -------------------------------------------------------------------------
  // Cross-tenant isolation — mismo trap que eliminar-ingesta.int-spec.ts
  // -------------------------------------------------------------------------
  it('T-REV-b (ISO): user A no puede revertir la ingesta PROCESADA de user B — Result.fail Y las filas de B quedan intactas', async () => {
    const ingB = await createIngesta(accountIdB, `b-revert-${RUN_ID}.xlsx`);
    await createTx(accountIdB, ingB.id, 10000n);
    await createTx(accountIdB, ingB.id, 20000n);

    const result = await repo.revertirYMarcarFallida(
      TEST_USER_ID_A,
      ingB.id,
      'intento cruzado',
    );

    expect(result.isFail()).toBe(true);

    // La Ingesta de B sigue PROCESADA, sin tocar.
    const ingestaAun = await prisma.ingesta.findUnique({
      where: { id: ingB.id },
    });
    expect(ingestaAun?.estado).toBe('PROCESADA');

    // Las transacciones de B — la aserción que un `account: { userId }` mal
    // acotado (o ausente) FALLARÍA aunque el count del padre ya diera 404.
    const count = await prisma.transaccion.count({
      where: { ingestaId: ingB.id },
    });
    expect(count).toBe(2);
  });

  // -------------------------------------------------------------------------
  // Aislamiento por ingesta — una ingesta ANTERIOR del MISMO usuario no se toca
  // -------------------------------------------------------------------------
  it('T-REV-c (aislamiento por ingesta): revertir la ingesta actual no borra las transacciones de una ingesta ANTERIOR del mismo usuario', async () => {
    const ingAnterior = await createIngesta(
      accountIdA,
      `a-anterior-${RUN_ID}.xlsx`,
    );
    await createTx(accountIdA, ingAnterior.id, 3000n);
    await createTx(accountIdA, ingAnterior.id, 4000n);

    const ingActual = await createIngesta(
      accountIdA,
      `a-actual-${RUN_ID}.xlsx`,
    );
    await createTx(accountIdA, ingActual.id, 5000n);

    const result = await repo.revertirYMarcarFallida(
      TEST_USER_ID_A,
      ingActual.id,
      'writer falló en la corrida actual',
    );

    expect(result.isOk()).toBe(true);

    // La ingesta ACTUAL: cero transacciones, FALLIDA.
    const countActual = await prisma.transaccion.count({
      where: { ingestaId: ingActual.id },
    });
    expect(countActual).toBe(0);

    // La ingesta ANTERIOR: sus 2 transacciones SIGUEN ahí, sin tocar.
    const countAnterior = await prisma.transaccion.count({
      where: { ingestaId: ingAnterior.id },
    });
    expect(countAnterior).toBe(2);
    const ingestaAnteriorAun = await prisma.ingesta.findUnique({
      where: { id: ingAnterior.id },
    });
    expect(ingestaAnteriorAun?.estado).toBe('PROCESADA');
  });

  // -------------------------------------------------------------------------
  // Fail-closed: una ingesta que ya NO está PROCESADA no se puede "revertir" de nuevo
  // -------------------------------------------------------------------------
  it('T-REV-d: revertir dos veces la misma ingesta — la segunda vez falla (ya no está PROCESADA), sin volver a tocar Transaccion', async () => {
    const ing = await createIngesta(accountIdA, `a-doble-${RUN_ID}.xlsx`);
    await createTx(accountIdA, ing.id, 1000n);

    const first = await repo.revertirYMarcarFallida(
      TEST_USER_ID_A,
      ing.id,
      'primer intento',
    );
    expect(first.isOk()).toBe(true);

    const second = await repo.revertirYMarcarFallida(
      TEST_USER_ID_A,
      ing.id,
      'segundo intento',
    );
    expect(second.isFail()).toBe(true);

    // El motivoFallo del PRIMER intento no se pisa con el segundo.
    const ingestaFinal = await prisma.ingesta.findUnique({
      where: { id: ing.id },
    });
    expect(ingestaFinal?.motivoFallo).toBe('primer intento');
  });
});
