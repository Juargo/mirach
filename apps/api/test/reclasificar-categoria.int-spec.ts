import 'dotenv/config';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';
import { loadEnv } from '../src/config/env';
import { PrismaReclasificarCategoriaRepository } from '../src/infrastructure/persistence/prisma-reclasificar-categoria.repository';
import { PrismaResumenMesRepository } from '../src/infrastructure/persistence/prisma-resumen-mes.repository';
import { CalcularResumenMesUseCase } from '../src/application/use-cases/calcular-resumen-mes.use-case';
import { crearCatalogoParaUsuario } from './support/catalogo.fixture';
import { Bucket } from '../src/domain/value-objects/bucket';
import { Categoria } from '../src/domain/value-objects/categoria';
import { EstadoSemaforo } from '../src/domain/value-objects/estado-semaforo';
import { TransaccionNoEncontradaError } from '../src/domain/errors/transaccion-no-encontrada.error';
import { BUCKET_IDS } from '../src/infrastructure/persistence/bucket-ids';
import { USER_ID_FIJO } from '../src/infrastructure/persistence/constants';

/**
 * Integration tests for PrismaReclasificarCategoriaRepository (US-013 S4,
 * CATAPI-01/03/04; US-037 CAT037-04) — two-user pattern, mirrors
 * detalle-bucket.int-spec.ts.
 *
 * Requires a live dev DB with ALLOW_DESTRUCTIVE_DB=1. Uses a RUN_ID to
 * isolate test data and cleans up in afterAll.
 *
 * US-037: the catalog is per-user now, so every synthetic test user needs
 * its OWN copy (`crearCatalogoParaUsuario`, `test/support/catalogo.fixture.ts` —
 * thin wrapper over `copiarCatalogoTemplate`, same primitive the demo/signup
 * paths use) — there is no more global `CATEGORIA_IDS` to borrow a fixture
 * category id from. `categoriaIdFor()` resolves the REAL, per-user row id.
 */

const RUN_ID = `reclasificarint-${Date.now()}`;

const TEST_USER_ID_A = `${USER_ID_FIJO}-${RUN_ID}`;
const TEST_USER_ID_B = `user-b-${RUN_ID}`;

describe('PrismaReclasificarCategoriaRepository (integration — real dev DB)', () => {
  const prisma = createPrismaClient(loadEnv());
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

    await prisma.user.create({
      data: { id: TEST_USER_ID_A, nombre: `Test User A ${RUN_ID}` },
    });
    await crearCatalogoParaUsuario(prisma, TEST_USER_ID_A);
    await prisma.user.create({
      data: { id: TEST_USER_ID_B, nombre: `Test User B ${RUN_ID}` },
    });
    await crearCatalogoParaUsuario(prisma, TEST_USER_ID_B);

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
    // Composite FK (PatronClasificacion.(categoriaId,userId) → Categoria) is
    // RESTRICT — must clear the copied catalog before the owning users.
    await limpiarCatalogo(TEST_USER_ID_A, TEST_USER_ID_B);
    await prisma.user.deleteMany({
      where: { id: { in: [TEST_USER_ID_A, TEST_USER_ID_B] } },
    });
    await prisma.$disconnect();
  });

  /** Borra el catálogo copiado (US-037) de uno o más usuarios de prueba. */
  const limpiarCatalogo = async (...userIds: string[]) => {
    await prisma.patronClasificacion.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.categoria.deleteMany({ where: { userId: { in: userIds } } });
  };

  /**
   * Resuelve el id REAL de la fila `Categoria` de ESTE usuario (US-037: ya
   * no existe un id global fijo por categoría — CATEGORIA_IDS solo sirve
   * para el usuario bootstrap/seed, D-09).
   */
  const categoriaIdFor = async (
    userId: string,
    nombre: Categoria,
  ): Promise<string> => {
    const row = await prisma.categoria.findUniqueOrThrow({
      where: { userId_nombre: { userId, nombre } },
      select: { id: true },
    });
    return row.id;
  };

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
      data: {
        accountId,
        ingestaId,
        fecha: FECHA,
        cargo,
        abono,
        categoriaId,
        bucketId,
        descripcion,
      },
    });

  // -------------------------------------------------------------------------
  // CATAPI-01 — userId isolation
  // -------------------------------------------------------------------------
  it('T4.4a: user A cannot reclassify user B transaction — count===0 → TransaccionNoEncontradaError, row unchanged', async () => {
    const deliveryIdDeUserB = await categoriaIdFor(
      TEST_USER_ID_B,
      Categoria.Delivery,
    );
    const userBTx = await createTx(
      accountIdB,
      ingestaIdB,
      10000n,
      0n,
      deliveryIdDeUserB,
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

    const unchanged = await prisma.transaccion.findUniqueOrThrow({
      where: { id: userBTx.id },
    });
    expect(unchanged.categoriaId).toBe(deliveryIdDeUserB);
    expect(unchanged.bucketId).toBe(BUCKET_IDS[Bucket.Deseos]);
  });

  it('T4.4b: user A can reclassify their own transaction — response + DB reflect the new value', async () => {
    const deliveryIdDeUserA = await categoriaIdFor(
      TEST_USER_ID_A,
      Categoria.Delivery,
    );
    const userATx = await createTx(
      accountIdA,
      ingestaIdA,
      8000n,
      0n,
      deliveryIdDeUserA,
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
    const streamingIdDeUserA = await categoriaIdFor(
      TEST_USER_ID_A,
      Categoria.Streaming,
    );
    expect(result.getValue()).toEqual({
      id: userATx.id,
      categoriaId: streamingIdDeUserA,
      categoria: Categoria.Streaming,
      bucket: Bucket.Deseos,
    });

    const updated = await prisma.transaccion.findUniqueOrThrow({
      where: { id: userATx.id },
    });
    expect(updated.categoriaId).toBe(streamingIdDeUserA);
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
        userId: TEST_USER_ID_A,
        accountId: accountIdA,
        banco: 'BCI',
        nombreArchivo: `within-${RUN_ID}.xlsx`,
        estado: 'PROCESADA',
      },
    });

    const withinUserId = `${TEST_USER_ID_A}-within`;
    await prisma.user.create({
      data: { id: withinUserId, nombre: 'within' },
    });
    await crearCatalogoParaUsuario(prisma, withinUserId);
    const acc = await prisma.account.create({
      data: {
        userId: withinUserId,
        banco: 'BCI',
        tipoCuenta: 'Cuenta Corriente',
        numeroCuenta: `bci-within-${RUN_ID}`,
      },
    });
    const ingWithin = await prisma.ingesta.create({
      data: {
        userId: withinUserId,
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
        categoriaId: await categoriaIdFor(withinUserId, Categoria.Delivery),
        bucketId: BUCKET_IDS[Bucket.Deseos],
        descripcion: 'Uber Eats',
      },
    });

    const antes = await calcularResumen.execute({
      userId: withinUserId,
      periodo: '2026-07',
    });
    const deseosAntes = antes
      .getValue()
      .resumen.buckets.find((b) => b.bucket === Bucket.Deseos)!;

    const result = await repo.reasignar(
      withinUserId,
      tx.id,
      Categoria.Streaming,
      Bucket.Deseos,
    );
    expect(result.isOk()).toBe(true);

    const despues = await calcularResumen.execute({
      userId: withinUserId,
      periodo: '2026-07',
    });
    const deseosDespues = despues
      .getValue()
      .resumen.buckets.find((b) => b.bucket === Bucket.Deseos)!;

    expect(deseosDespues.total).toBe(deseosAntes.total);
    expect(deseosDespues.porcentajeBp).toBe(deseosAntes.porcentajeBp);

    const updated = await prisma.transaccion.findUniqueOrThrow({
      where: { id: tx.id },
    });
    expect(updated.bucketId).toBe(BUCKET_IDS[Bucket.Deseos]);

    // cleanup this scenario's own scope (separate user/account/ingesta)
    await prisma.transaccion.deleteMany({
      where: { id: { in: [ingreso.id, tx.id] } },
    });
    await prisma.ingesta.deleteMany({
      where: { id: { in: [ing.id, ingWithin.id] } },
    });
    await prisma.account.deleteMany({ where: { id: acc.id } });
    await limpiarCatalogo(withinUserId);
    await prisma.user.deleteMany({ where: { id: withinUserId } });
  });

  // -------------------------------------------------------------------------
  // CATAPI-04 — cross-bucket reclassify: exact BigInt money move + threshold flip
  // -------------------------------------------------------------------------
  it('T4.5b: Deseos→Necesidades shifts both bucket totals by the exact amount and can flip estadoSemaforo away from Verde', async () => {
    const crossUserId = `${TEST_USER_ID_A}-cross`;
    await prisma.user.create({
      data: { id: crossUserId, nombre: 'cross' },
    });
    await crearCatalogoParaUsuario(prisma, crossUserId);
    const acc = await prisma.account.create({
      data: {
        userId: crossUserId,
        banco: 'BCI',
        tipoCuenta: 'Cuenta Corriente',
        numeroCuenta: `bci-cross-${RUN_ID}`,
      },
    });
    const ing = await prisma.ingesta.create({
      data: {
        userId: crossUserId,
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
        categoriaId: await categoriaIdFor(crossUserId, Categoria.Supermercado),
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
        categoriaId: await categoriaIdFor(crossUserId, Categoria.Delivery),
        bucketId: BUCKET_IDS[Bucket.Deseos],
        descripcion: 'Uber Eats',
      },
    });

    const antes = await calcularResumen.execute({
      userId: crossUserId,
      periodo: '2026-07',
    });
    const necAntes = antes
      .getValue()
      .resumen.buckets.find((b) => b.bucket === Bucket.Necesidades)!;
    const desAntes = antes
      .getValue()
      .resumen.buckets.find((b) => b.bucket === Bucket.Deseos)!;
    expect(necAntes.total).toBe(50000n);
    expect(necAntes.estadoSemaforo).toBe(EstadoSemaforo.Verde);
    expect(desAntes.total).toBe(10000n);

    const result = await repo.reasignar(
      crossUserId,
      movida.id,
      Categoria.Transporte,
      Bucket.Necesidades,
    );
    expect(result.isOk()).toBe(true);

    const despues = await calcularResumen.execute({
      userId: crossUserId,
      periodo: '2026-07',
    });
    const necDespues = despues
      .getValue()
      .resumen.buckets.find((b) => b.bucket === Bucket.Necesidades)!;
    const desDespues = despues
      .getValue()
      .resumen.buckets.find((b) => b.bucket === Bucket.Deseos)!;

    // Exact BigInt deltas, no float drift.
    expect(necDespues.total).toBe(necAntes.total + 10000n);
    expect(desDespues.total).toBe(desAntes.total - 10000n);
    expect(necDespues.total).toBe(60000n);
    expect(desDespues.total).toBe(0n);

    // Necesidades crossed 50% → estadoSemaforo flips away from Verde.
    expect(necDespues.estadoSemaforo).not.toBe(EstadoSemaforo.Verde);

    const updated = await prisma.transaccion.findUniqueOrThrow({
      where: { id: movida.id },
    });
    expect(updated.bucketId).toBe(BUCKET_IDS[Bucket.Necesidades]);
    expect(updated.categoriaId).toBe(
      await categoriaIdFor(crossUserId, Categoria.Transporte),
    );

    await prisma.transaccion.deleteMany({ where: { ingestaId: ing.id } });
    await prisma.ingesta.deleteMany({ where: { id: ing.id } });
    await prisma.account.deleteMany({ where: { id: acc.id } });
    await limpiarCatalogo(crossUserId);
    await prisma.user.deleteMany({ where: { id: crossUserId } });
  });

  // -------------------------------------------------------------------------
  // CAT037-04 — two users reclassifying to the same categoría nombre get
  // different, user-owned ids (design.md §9.2, scenario "Two users
  // reclassifying to the same nombre get different ids")
  // -------------------------------------------------------------------------
  it('T4.7: user A and user B reclassifying to the same categoría nombre ("Ahorro") persist different, user-owned ids', async () => {
    const txA = await createTx(
      accountIdA,
      ingestaIdA,
      3000n,
      0n,
      null,
      null,
      'A tx to reclassify',
    );
    const txB = await createTx(
      accountIdB,
      ingestaIdB,
      3000n,
      0n,
      null,
      null,
      'B tx to reclassify',
    );

    const resultA = await repo.reasignar(
      TEST_USER_ID_A,
      txA.id,
      Categoria.Ahorro,
      Bucket.Ahorro,
    );
    const resultB = await repo.reasignar(
      TEST_USER_ID_B,
      txB.id,
      Categoria.Ahorro,
      Bucket.Ahorro,
    );

    expect(resultA.isOk()).toBe(true);
    expect(resultB.isOk()).toBe(true);
    const ahorroIdA = resultA.getValue().categoriaId;
    const ahorroIdB = resultB.getValue().categoriaId;

    expect(ahorroIdA).not.toBe(ahorroIdB);
    expect(ahorroIdA).toBe(
      await categoriaIdFor(TEST_USER_ID_A, Categoria.Ahorro),
    );
    expect(ahorroIdB).toBe(
      await categoriaIdFor(TEST_USER_ID_B, Categoria.Ahorro),
    );

    await prisma.transaccion.deleteMany({
      where: { id: { in: [txA.id, txB.id] } },
    });
  });
});
