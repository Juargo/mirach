import 'dotenv/config';
import { PrismaService } from '../src/infrastructure/persistence/prisma.service';
import { PrismaReclasificarCategoriaRepository } from '../src/infrastructure/persistence/prisma-reclasificar-categoria.repository';
import { PrismaResumenMesRepository } from '../src/infrastructure/persistence/prisma-resumen-mes.repository';
import { CalcularResumenMesUseCase } from '../src/application/use-cases/calcular-resumen-mes.use-case';
import { Bucket } from '../src/domain/value-objects/bucket';
import { Categoria } from '../src/domain/value-objects/categoria';
import { EstadoSemaforo } from '../src/domain/value-objects/estado-semaforo';
import { TransaccionNoEncontradaError } from '../src/domain/errors/transaccion-no-encontrada.error';
import { BUCKET_IDS } from '../src/infrastructure/persistence/bucket-ids';
import { CATEGORIA_IDS } from '../src/infrastructure/persistence/categoria-ids';
import { USER_ID_FIJO } from '../src/infrastructure/persistence/constants';

/**
 * Integration tests for PrismaReclasificarCategoriaRepository (US-013 S4,
 * CATAPI-01/03/04) — two-user pattern, mirrors detalle-bucket.int-spec.ts.
 *
 * Requires a live dev DB with ALLOW_DESTRUCTIVE_DB=1. Uses a RUN_ID to
 * isolate test data and cleans up in afterAll.
 *
 * NOT executed in this apply session (same precedent as S1-S3's gated
 * suites): the only reachable Postgres is the shared Supabase dev DB, and
 * this slice's own migration (S1's add_categoria) has not been applied
 * there yet — see the S1/S2 apply notes. Needs a human run once the schema
 * is reconciled.
 */

const RUN_ID = `reclasificarint-${Date.now()}`;

const TEST_USER_ID_A = `${USER_ID_FIJO}-${RUN_ID}`;
const TEST_USER_ID_B = `user-b-${RUN_ID}`;

describe('PrismaReclasificarCategoriaRepository (integration — real dev DB)', () => {
  const prisma = new PrismaService();
  const repo = new PrismaReclasificarCategoriaRepository(prisma);
  const resumenReader = new PrismaResumenMesRepository(prisma);
  const calcularResumen = new CalcularResumenMesUseCase(resumenReader);

  let accountIdA: string;
  let accountIdB: string;
  let ingestaIdA: string;
  let ingestaIdB: string;

  const FECHA = new Date('2026-07-15T00:00:00.000Z');

  beforeAll(async () => {
    await prisma.$connect();

    await prisma.user.create({ data: { id: TEST_USER_ID_A, nombre: `Test User A ${RUN_ID}` } });
    await prisma.user.create({ data: { id: TEST_USER_ID_B, nombre: `Test User B ${RUN_ID}` } });

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
        accountId: accountIdA,
        banco: 'BCI',
        nombreArchivo: `a-${RUN_ID}.xlsx`,
        estado: 'PROCESADA',
      },
    });
    ingestaIdA = ingA.id;

    const ingB = await prisma.ingesta.create({
      data: {
        accountId: accountIdB,
        banco: 'Santander',
        nombreArchivo: `b-${RUN_ID}.xlsx`,
        estado: 'PROCESADA',
      },
    });
    ingestaIdB = ingB.id;
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
      where: { id: { in: [TEST_USER_ID_A, TEST_USER_ID_B] } },
    });
    await prisma.$disconnect();
  });

  const createTx = (
    accountId: string,
    ingestaId: string,
    cargo: bigint,
    abono: bigint,
    categoriaId: string | null,
    bucketId: string | null,
    descripcion = 'Test tx',
  ) =>
    prisma.transaccion.create({
      data: { accountId, ingestaId, fecha: FECHA, cargo, abono, categoriaId, bucketId, descripcion },
    });

  // -------------------------------------------------------------------------
  // CATAPI-01 — userId isolation
  // -------------------------------------------------------------------------
  it('T4.4a: user A cannot reclassify user B transaction — count===0 → TransaccionNoEncontradaError, row unchanged', async () => {
    const userBTx = await createTx(
      accountIdB,
      ingestaIdB,
      10000n,
      0n,
      CATEGORIA_IDS[Categoria.Delivery],
      BUCKET_IDS[Bucket.Deseos],
      'UserB Delivery tx',
    );

    const result = await repo.reasignar(
      TEST_USER_ID_A,
      userBTx.id,
      Categoria.Transporte,
      Bucket.Necesidades,
    );

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TransaccionNoEncontradaError);

    const unchanged = await prisma.transaccion.findUniqueOrThrow({ where: { id: userBTx.id } });
    expect(unchanged.categoriaId).toBe(CATEGORIA_IDS[Categoria.Delivery]);
    expect(unchanged.bucketId).toBe(BUCKET_IDS[Bucket.Deseos]);
  });

  it('T4.4b: user A can reclassify their own transaction — response + DB reflect the new value', async () => {
    const userATx = await createTx(
      accountIdA,
      ingestaIdA,
      8000n,
      0n,
      CATEGORIA_IDS[Categoria.Delivery],
      BUCKET_IDS[Bucket.Deseos],
      'UserA Delivery tx',
    );

    const result = await repo.reasignar(
      TEST_USER_ID_A,
      userATx.id,
      Categoria.Streaming,
      Bucket.Deseos,
    );

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual({
      id: userATx.id,
      categoria: Categoria.Streaming,
      bucket: Bucket.Deseos,
    });

    const updated = await prisma.transaccion.findUniqueOrThrow({ where: { id: userATx.id } });
    expect(updated.categoriaId).toBe(CATEGORIA_IDS[Categoria.Streaming]);
    expect(updated.bucketId).toBe(BUCKET_IDS[Bucket.Deseos]);
  });

  // -------------------------------------------------------------------------
  // CATAPI-03 — within-bucket reclassify: categoría changes, bucket + resumen don't
  // -------------------------------------------------------------------------
  it('T4.5a: Delivery→Streaming (both Deseos) leaves bucketId and the Deseos resumen subtotal unchanged', async () => {
    // Isolated ingesta so this scenario's resumen totals aren't polluted by
    // other test cases in this file (all share the same calendar month).
    const ing = await prisma.ingesta.create({
      data: {
        accountId: accountIdA,
        banco: 'BCI',
        nombreArchivo: `within-${RUN_ID}.xlsx`,
        estado: 'PROCESADA',
      },
    });

    await prisma.user.create({ data: { id: `${TEST_USER_ID_A}-within`, nombre: 'within' } });
    const acc = await prisma.account.create({
      data: {
        userId: `${TEST_USER_ID_A}-within`,
        banco: 'BCI',
        tipoCuenta: 'Cuenta Corriente',
        numeroCuenta: `bci-within-${RUN_ID}`,
      },
    });
    const ingWithin = await prisma.ingesta.create({
      data: {
        accountId: acc.id,
        banco: 'BCI',
        nombreArchivo: `within2-${RUN_ID}.xlsx`,
        estado: 'PROCESADA',
      },
    });

    const ingreso = await prisma.transaccion.create({
      data: {
        accountId: acc.id,
        ingestaId: ingWithin.id,
        fecha: FECHA,
        cargo: 0n,
        abono: 100000n,
        categoriaId: null,
        bucketId: BUCKET_IDS[Bucket.Ingreso],
        descripcion: 'Sueldo',
      },
    });
    const tx = await prisma.transaccion.create({
      data: {
        accountId: acc.id,
        ingestaId: ingWithin.id,
        fecha: FECHA,
        cargo: 10000n,
        abono: 0n,
        categoriaId: CATEGORIA_IDS[Categoria.Delivery],
        bucketId: BUCKET_IDS[Bucket.Deseos],
        descripcion: 'Uber Eats',
      },
    });

    const antes = await calcularResumen.execute({
      userId: `${TEST_USER_ID_A}-within`,
      periodo: '2026-07',
    });
    const deseosAntes = antes.getValue().resumen.buckets.find((b) => b.bucket === Bucket.Deseos)!;

    const result = await repo.reasignar(
      `${TEST_USER_ID_A}-within`,
      tx.id,
      Categoria.Streaming,
      Bucket.Deseos,
    );
    expect(result.isOk()).toBe(true);

    const despues = await calcularResumen.execute({
      userId: `${TEST_USER_ID_A}-within`,
      periodo: '2026-07',
    });
    const deseosDespues = despues.getValue().resumen.buckets.find((b) => b.bucket === Bucket.Deseos)!;

    expect(deseosDespues.total).toBe(deseosAntes.total);
    expect(deseosDespues.porcentajeBp).toBe(deseosAntes.porcentajeBp);

    const updated = await prisma.transaccion.findUniqueOrThrow({ where: { id: tx.id } });
    expect(updated.bucketId).toBe(BUCKET_IDS[Bucket.Deseos]);

    // cleanup this scenario's own scope (separate user/account/ingesta)
    await prisma.transaccion.deleteMany({ where: { id: { in: [ingreso.id, tx.id] } } });
    await prisma.ingesta.deleteMany({ where: { id: { in: [ing.id, ingWithin.id] } } });
    await prisma.account.deleteMany({ where: { id: acc.id } });
    await prisma.user.deleteMany({ where: { id: `${TEST_USER_ID_A}-within` } });
  });

  // -------------------------------------------------------------------------
  // CATAPI-04 — cross-bucket reclassify: exact BigInt money move + threshold flip
  // -------------------------------------------------------------------------
  it('T4.5b: Deseos→Necesidades shifts both bucket totals by the exact amount and can flip estadoSemaforo away from Verde', async () => {
    await prisma.user.create({ data: { id: `${TEST_USER_ID_A}-cross`, nombre: 'cross' } });
    const acc = await prisma.account.create({
      data: {
        userId: `${TEST_USER_ID_A}-cross`,
        banco: 'BCI',
        tipoCuenta: 'Cuenta Corriente',
        numeroCuenta: `bci-cross-${RUN_ID}`,
      },
    });
    const ing = await prisma.ingesta.create({
      data: {
        accountId: acc.id,
        banco: 'BCI',
        nombreArchivo: `cross-${RUN_ID}.xlsx`,
        estado: 'PROCESADA',
      },
    });

    await prisma.transaccion.create({
      data: {
        accountId: acc.id,
        ingestaId: ing.id,
        fecha: FECHA,
        cargo: 0n,
        abono: 100000n,
        categoriaId: null,
        bucketId: BUCKET_IDS[Bucket.Ingreso],
        descripcion: 'Sueldo',
      },
    });
    // Necesidades sits EXACTLY at the 50% Verde/Amarillo boundary (5000bp) —
    // Verde is inclusive at <=5000bp per calcularEstadoBucket.
    await prisma.transaccion.create({
      data: {
        accountId: acc.id,
        ingestaId: ing.id,
        fecha: FECHA,
        cargo: 50000n,
        abono: 0n,
        categoriaId: CATEGORIA_IDS[Categoria.Supermercado],
        bucketId: BUCKET_IDS[Bucket.Necesidades],
        descripcion: 'Supermercado',
      },
    });
    const movida = await prisma.transaccion.create({
      data: {
        accountId: acc.id,
        ingestaId: ing.id,
        fecha: FECHA,
        cargo: 10000n,
        abono: 0n,
        categoriaId: CATEGORIA_IDS[Categoria.Delivery],
        bucketId: BUCKET_IDS[Bucket.Deseos],
        descripcion: 'Uber Eats',
      },
    });

    const antes = await calcularResumen.execute({
      userId: `${TEST_USER_ID_A}-cross`,
      periodo: '2026-07',
    });
    const necAntes = antes.getValue().resumen.buckets.find((b) => b.bucket === Bucket.Necesidades)!;
    const desAntes = antes.getValue().resumen.buckets.find((b) => b.bucket === Bucket.Deseos)!;
    expect(necAntes.total).toBe(50000n);
    expect(necAntes.estadoSemaforo).toBe(EstadoSemaforo.Verde);
    expect(desAntes.total).toBe(10000n);

    const result = await repo.reasignar(
      `${TEST_USER_ID_A}-cross`,
      movida.id,
      Categoria.Transporte,
      Bucket.Necesidades,
    );
    expect(result.isOk()).toBe(true);

    const despues = await calcularResumen.execute({
      userId: `${TEST_USER_ID_A}-cross`,
      periodo: '2026-07',
    });
    const necDespues = despues.getValue().resumen.buckets.find((b) => b.bucket === Bucket.Necesidades)!;
    const desDespues = despues.getValue().resumen.buckets.find((b) => b.bucket === Bucket.Deseos)!;

    // Exact BigInt deltas, no float drift.
    expect(necDespues.total).toBe(necAntes.total + 10000n);
    expect(desDespues.total).toBe(desAntes.total - 10000n);
    expect(necDespues.total).toBe(60000n);
    expect(desDespues.total).toBe(0n);

    // Necesidades crossed 50% → estadoSemaforo flips away from Verde.
    expect(necDespues.estadoSemaforo).not.toBe(EstadoSemaforo.Verde);

    const updated = await prisma.transaccion.findUniqueOrThrow({ where: { id: movida.id } });
    expect(updated.bucketId).toBe(BUCKET_IDS[Bucket.Necesidades]);
    expect(updated.categoriaId).toBe(CATEGORIA_IDS[Categoria.Transporte]);

    await prisma.transaccion.deleteMany({ where: { ingestaId: ing.id } });
    await prisma.ingesta.deleteMany({ where: { id: ing.id } });
    await prisma.account.deleteMany({ where: { id: acc.id } });
    await prisma.user.deleteMany({ where: { id: `${TEST_USER_ID_A}-cross` } });
  });
});
