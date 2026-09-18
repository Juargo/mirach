import {
  runBackfillIcono,
  main,
  type BackfillIconoClient,
} from '../../../prisma/backfill-icono-categoria';
import { BUCKET_IDS } from './bucket-ids';
import {
  CATEGORIA_TEMPLATE,
  CATEGORIA_TEMPLATE_SIZE,
} from './catalogo-template';

/**
 * backfill-icono-categoria — unit tests (ADR-045, sin BD).
 *
 * `runBackfillIcono` solo depende de un subconjunto estructural de
 * PrismaClient (BackfillIconoClient); este fake reproduce
 * count/updateMany/$transaction en memoria (mismo patrón que
 * backfill-categorias.spec.ts, ADR-015).
 */

interface UpdateManyCall {
  where: { nombre: string; bucketId: string; icono: null };
  data: { icono: string };
}

function makeFakeClient(countByKey: Map<string, number> = new Map()) {
  const updateManyCalls: UpdateManyCall[] = [];
  let transactionCalls = 0;

  const client: BackfillIconoClient = {
    categoria: {
      count: async ({ where }) => {
        return countByKey.get(`${where.nombre}|${where.bucketId}`) ?? 0;
      },
      updateMany: async ({ where, data }) => {
        updateManyCalls.push({ where, data });
        const count = countByKey.get(`${where.nombre}|${where.bucketId}`) ?? 0;
        return { count };
      },
    },
    $transaction: async <T>(ops: Promise<T>[]) => {
      transactionCalls++;
      return Promise.all(ops);
    },
  };

  return {
    client,
    updateManyCalls,
    getTransactionCalls: () => transactionCalls,
  };
}

describe('runBackfillIcono — dry-run (ADR-045, unit, sin BD)', () => {
  it('no llama updateMany ni $transaction, y reporta conteos tomados de count()', async () => {
    const countByKey = new Map<string, number>();
    // Fake: 3 filas Supermercado/Necesidades pendientes, el resto en 0.
    const supermercado = CATEGORIA_TEMPLATE.find(
      (c) => c.nombre === 'Supermercado',
    )!;
    countByKey.set(
      `${supermercado.nombre}|${BUCKET_IDS[supermercado.bucket]}`,
      3,
    );
    const { client, updateManyCalls, getTransactionCalls } =
      makeFakeClient(countByKey);

    const summary = await runBackfillIcono(client, { dryRun: true });

    expect(updateManyCalls).toHaveLength(0);
    expect(getTransactionCalls()).toBe(0);
    expect(summary.totalActualizadas).toBe(3);
    expect(summary.porCategoria[`Supermercado (${supermercado.bucket})`]).toBe(
      3,
    );
  });
});

describe('runBackfillIcono — corrida real (ADR-045, unit, sin BD)', () => {
  it(`emite exactamente CATEGORIA_TEMPLATE_SIZE (${CATEGORIA_TEMPLATE_SIZE}) llamadas a updateMany, dentro de una sola $transaction`, async () => {
    const { client, updateManyCalls, getTransactionCalls } = makeFakeClient();

    await runBackfillIcono(client, { dryRun: false });

    expect(updateManyCalls).toHaveLength(CATEGORIA_TEMPLATE_SIZE);
    expect(getTransactionCalls()).toBe(1);
  });

  it('cada updateMany lleva icono: null en el WHERE (WHERE completo verificado sobre una entrada)', async () => {
    const { client, updateManyCalls } = makeFakeClient();

    await runBackfillIcono(client, { dryRun: false });

    const supermercado = CATEGORIA_TEMPLATE.find(
      (c) => c.nombre === 'Supermercado',
    )!;
    const call = updateManyCalls.find(
      (c) => c.where.nombre === 'Supermercado',
    )!;
    expect(call.where).toEqual({
      nombre: 'Supermercado',
      bucketId: BUCKET_IDS[supermercado.bucket],
      icono: null,
    });

    // Todas las demás llamadas también deben llevar icono: null en el WHERE.
    for (const c of updateManyCalls) {
      expect(c.where.icono).toBeNull();
    }
  });

  it('el bucketId del WHERE es BUCKET_IDS[entrada.bucket] para cada entrada de la plantilla — derivado, nunca literal', async () => {
    const { client, updateManyCalls } = makeFakeClient();

    await runBackfillIcono(client, { dryRun: false });

    for (const entrada of CATEGORIA_TEMPLATE) {
      const call = updateManyCalls.find(
        (c) => c.where.nombre === entrada.nombre,
      )!;
      expect(call.where.bucketId).toBe(BUCKET_IDS[entrada.bucket]);
    }
  });

  it('el data.icono de cada updateMany es el icono de su entrada de plantilla', async () => {
    const { client, updateManyCalls } = makeFakeClient();

    await runBackfillIcono(client, { dryRun: false });

    for (const entrada of CATEGORIA_TEMPLATE) {
      const call = updateManyCalls.find(
        (c) => c.where.nombre === entrada.nombre,
      )!;
      expect(call.data.icono).toBe(entrada.icono);
    }
  });

  it('totalActualizadas suma los count devueltos por los updateMany, y porCategoria desambigua el bucket', async () => {
    const countByKey = new Map<string, number>();
    const supermercado = CATEGORIA_TEMPLATE.find(
      (c) => c.nombre === 'Supermercado',
    )!;
    const streaming = CATEGORIA_TEMPLATE.find((c) => c.nombre === 'Streaming')!;
    countByKey.set(
      `${supermercado.nombre}|${BUCKET_IDS[supermercado.bucket]}`,
      5,
    );
    countByKey.set(`${streaming.nombre}|${BUCKET_IDS[streaming.bucket]}`, 2);
    const { client } = makeFakeClient(countByKey);

    const summary = await runBackfillIcono(client, { dryRun: false });

    expect(summary.totalActualizadas).toBe(7);
    expect(summary.porCategoria[`Supermercado (${supermercado.bucket})`]).toBe(
      5,
    );
    expect(summary.porCategoria[`Streaming (${streaming.bucket})`]).toBe(2);
    // Entradas sin conteo fake quedan en 0, no undefined.
    const otra = CATEGORIA_TEMPLATE.find((c) => c.nombre === 'Combustible')!;
    expect(summary.porCategoria[`Combustible (${otra.bucket})`]).toBe(0);
  });

  it('idempotencia observable: si todos los updateMany devuelven count 0, el summary da totalActualizadas 0 sin romper', async () => {
    const { client } = makeFakeClient(new Map());

    const summary = await runBackfillIcono(client, { dryRun: false });

    expect(summary.totalActualizadas).toBe(0);
    for (const entrada of CATEGORIA_TEMPLATE) {
      expect(
        summary.porCategoria[`${entrada.nombre} (${entrada.bucket})`],
      ).toBe(0);
    }
  });
});

describe('backfill-icono-categoria — gate ALLOW_DESTRUCTIVE_DB (unit, sin BD)', () => {
  const originalAllow = process.env.ALLOW_DESTRUCTIVE_DB;
  const originalDbUrl = process.env.DATABASE_URL;
  const originalDirectUrl = process.env.DIRECT_URL;
  const originalConfirmProdBackfill = process.env.CONFIRM_PROD_BACKFILL;

  afterEach(() => {
    process.env.ALLOW_DESTRUCTIVE_DB = originalAllow;
    process.env.DATABASE_URL = originalDbUrl;
    process.env.DIRECT_URL = originalDirectUrl;
    process.env.CONFIRM_PROD_BACKFILL = originalConfirmProdBackfill;
  });

  it('se rehúsa a correr sin ALLOW_DESTRUCTIVE_DB=1 (no llega a conectar a Prisma)', async () => {
    delete process.env.ALLOW_DESTRUCTIVE_DB;
    process.env.DATABASE_URL = 'postgres://x@dev-host/db';
    delete process.env.DIRECT_URL;

    await expect(main([])).rejects.toThrow(/ALLOW_DESTRUCTIVE_DB/);
  });
});
