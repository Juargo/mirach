import {
  runBackfillCatalogo,
  main,
  type BackfillCatalogoClient,
  type BackfillCatalogoTxClient,
} from '../../../prisma/backfill-catalogo-faltante';
import { BUCKET_IDS } from './bucket-ids';
import { CATEGORIA_TEMPLATE, PATRON_TEMPLATE } from './catalogo-template';
import { Bucket } from '../../domain/value-objects/bucket';

/**
 * backfill-catalogo-faltante — unit tests (sin BD).
 *
 * `runBackfillCatalogo` solo depende de un subconjunto estructural de
 * PrismaClient (BackfillCatalogoClient); este fake reproduce
 * findMany/createMany/$transaction en memoria (mismo patrón que
 * backfill-icono-categoria.spec.ts).
 */

const USER_ID = 'user-1';

interface FakeCategoriaRow {
  id: string;
  userId: string;
  nombre: string;
  bucketId: string;
}

interface FakePatronRow {
  patron: string;
}

interface CreateManyCategoriaCall {
  data: Array<{
    userId: string;
    nombre: string;
    bucketId: string;
    icono: string;
  }>;
  skipDuplicates: boolean;
}

interface CreateManyPatronCall {
  data: Array<{
    userId: string;
    patron: string;
    matchType: string;
    categoriaId: string;
    prioridad: number;
  }>;
}

/**
 * Fake completo: mantiene un estado mutable de categorías/patrones por
 * usuario y reproduce la semántica real de Prisma — createMany dentro de
 * `$transaction` sí debe quedar visible a un `findMany` posterior DENTRO de
 * la misma transacción (necesario para que el paso de "releer ids reales"
 * tenga algo que leer).
 */
function makeFakeClient(seed: {
  categorias?: FakeCategoriaRow[];
  patrones?: FakePatronRow[];
}) {
  const categorias = [...(seed.categorias ?? [])];
  const patrones = [...(seed.patrones ?? [])];
  const categoriaCreateManyCalls: CreateManyCategoriaCall[] = [];
  const patronCreateManyCalls: CreateManyPatronCall[] = [];
  const callOrder: string[] = [];
  let transactionCalls = 0;
  let nextId = 100;

  const tx: BackfillCatalogoTxClient = {
    categoria: {
      createMany: async ({ data, skipDuplicates }) => {
        callOrder.push('categoria.createMany');
        categoriaCreateManyCalls.push({ data, skipDuplicates });
        let count = 0;
        for (const row of data) {
          const yaExiste = categorias.some(
            (c) =>
              c.userId === row.userId &&
              c.bucketId === row.bucketId &&
              c.nombre === row.nombre,
          );
          if (yaExiste && skipDuplicates) continue;
          categorias.push({
            id: `cat-${nextId++}`,
            userId: row.userId,
            nombre: row.nombre,
            bucketId: row.bucketId,
          });
          count++;
        }
        return { count };
      },
      findMany: async ({ where }) => {
        callOrder.push('categoria.findMany');
        return categorias
          .filter((c) => c.userId === where.userId)
          .map((c) => ({ id: c.id, nombre: c.nombre, bucketId: c.bucketId }));
      },
    },
    patronClasificacion: {
      createMany: async ({ data }) => {
        callOrder.push('patronClasificacion.createMany');
        patronCreateManyCalls.push({ data });
        for (const row of data) {
          patrones.push({ patron: row.patron });
        }
        return { count: data.length };
      },
    },
  };

  const client: BackfillCatalogoClient = {
    categoria: {
      findMany: async ({ where }) =>
        categorias
          .filter((c) => c.userId === where.userId)
          .map((c) => ({ id: c.id, nombre: c.nombre, bucketId: c.bucketId })),
    },
    patronClasificacion: {
      findMany: async ({ where: _where }) => patrones.map((p) => ({ ...p })),
    },
    $transaction: async (fn) => {
      transactionCalls++;
      return fn(tx);
    },
  };

  return {
    client,
    categoriaCreateManyCalls,
    patronCreateManyCalls,
    callOrder,
    getTransactionCalls: () => transactionCalls,
    getCategorias: () => categorias,
    getPatrones: () => patrones,
  };
}

/** Catálogo completo: todas las categorías y patrones de la plantilla ya existen. */
function seedCatalogoCompleto(): {
  categorias: FakeCategoriaRow[];
  patrones: FakePatronRow[];
} {
  const categorias = CATEGORIA_TEMPLATE.map((entrada, index) => ({
    id: `cat-existente-${index}`,
    userId: USER_ID,
    nombre: entrada.nombre,
    bucketId: BUCKET_IDS[entrada.bucket],
  }));
  const patrones = PATRON_TEMPLATE.map((entrada) => ({
    patron: entrada.patron,
  }));
  return { categorias, patrones };
}

describe('runBackfillCatalogo — catálogo completo (unit, sin BD)', () => {
  it('no inserta nada, summary vacío, no llama $transaction', async () => {
    const { client, getTransactionCalls } = makeFakeClient(
      seedCatalogoCompleto(),
    );

    const summary = await runBackfillCatalogo(client, {
      userId: USER_ID,
      dryRun: false,
    });

    expect(summary.categoriasInsertadas).toEqual([]);
    expect(summary.patronesInsertados).toEqual([]);
    expect(getTransactionCalls()).toBe(0);
  });
});

describe('runBackfillCatalogo — categorías faltantes (unit, sin BD)', () => {
  it('inserta Deuda y las tres Desconocido, cada una con el bucketId correcto y distinto entre sí', async () => {
    // Seed: catálogo completo MENOS Deuda y las tres Desconocido.
    const seed = seedCatalogoCompleto();
    seed.categorias = seed.categorias.filter(
      (c) => c.nombre !== 'Deuda' && c.nombre !== 'Desconocido',
    );

    const { client, categoriaCreateManyCalls } = makeFakeClient(seed);

    const summary = await runBackfillCatalogo(client, {
      userId: USER_ID,
      dryRun: false,
    });

    expect(summary.categoriasInsertadas).toHaveLength(4);
    expect(summary.categoriasInsertadas).toEqual(
      expect.arrayContaining([
        'Deuda (Necesidades)',
        'Desconocido (Necesidades)',
        'Desconocido (Deseos)',
        'Desconocido (Ahorro)',
      ]),
    );

    // El createMany real llevó exactamente esas 4 filas.
    expect(categoriaCreateManyCalls).toHaveLength(1);
    const insertedNames = categoriaCreateManyCalls[0].data.map((d) => d.nombre);
    expect(insertedNames).toEqual([
      'Deuda',
      'Desconocido',
      'Desconocido',
      'Desconocido',
    ]);

    // Las tres Desconocido van a buckets DISTINTOS — un match por nombre
    // solo las hubiera confundido entre sí.
    const desconocidoRows = categoriaCreateManyCalls[0].data.filter(
      (d) => d.nombre === 'Desconocido',
    );
    const bucketIds = desconocidoRows.map((d) => d.bucketId);
    expect(new Set(bucketIds).size).toBe(3);
    expect(bucketIds.sort()).toEqual(
      [
        BUCKET_IDS[Bucket.Necesidades],
        BUCKET_IDS[Bucket.Deseos],
        BUCKET_IDS[Bucket.Ahorro],
      ].sort(),
    );
  });

  it('un usuario con Desconocido SOLO en Necesidades sigue faltándole Desconocido en Deseos y Ahorro (match por nombre solo las confundiría)', async () => {
    // Seed: catálogo completo, pero de las tres Desconocido el usuario solo
    // tiene la de Necesidades — las de Deseos y Ahorro le faltan. Un match
    // por `nombre` solo (sin bucketId) vería "Desconocido" ya presente y
    // concluiría, incorrectamente, que no falta ninguna.
    const seed = seedCatalogoCompleto();
    seed.categorias = seed.categorias.filter(
      (c) =>
        c.nombre !== 'Desconocido' ||
        c.bucketId === BUCKET_IDS[Bucket.Necesidades],
    );

    const { client, categoriaCreateManyCalls } = makeFakeClient(seed);

    const summary = await runBackfillCatalogo(client, {
      userId: USER_ID,
      dryRun: false,
    });

    expect(summary.categoriasInsertadas).toEqual(
      expect.arrayContaining(['Desconocido (Deseos)', 'Desconocido (Ahorro)']),
    );
    expect(summary.categoriasInsertadas).not.toContain(
      'Desconocido (Necesidades)',
    );

    expect(categoriaCreateManyCalls).toHaveLength(1);
    const insertedBucketIds = categoriaCreateManyCalls[0].data
      .filter((d) => d.nombre === 'Desconocido')
      .map((d) => d.bucketId);
    expect(insertedBucketIds.sort()).toEqual(
      [BUCKET_IDS[Bucket.Deseos], BUCKET_IDS[Bucket.Ahorro]].sort(),
    );
  });
});

describe('runBackfillCatalogo — patrones faltantes (unit, sin BD)', () => {
  it('resuelve categoriaId por clave compuesta, incluso para una categoría recién creada en la misma corrida', async () => {
    // Seed: Deuda no existe (ni sus patrones); resto del catálogo completo.
    const seed = seedCatalogoCompleto();
    seed.categorias = seed.categorias.filter((c) => c.nombre !== 'Deuda');
    seed.patrones = seed.patrones.filter(
      (p) => p.patron !== 'pago deuda tarjeta' && p.patron !== 'sobregiro',
    );

    const { client, patronCreateManyCalls, getCategorias } =
      makeFakeClient(seed);

    const summary = await runBackfillCatalogo(client, {
      userId: USER_ID,
      dryRun: false,
    });

    expect(summary.patronesInsertados.sort()).toEqual(
      ['pago deuda tarjeta', 'sobregiro'].sort(),
    );

    const deudaId = getCategorias().find(
      (c) =>
        c.nombre === 'Deuda' && c.bucketId === BUCKET_IDS[Bucket.Necesidades],
    )!.id;

    expect(patronCreateManyCalls).toHaveLength(1);
    for (const row of patronCreateManyCalls[0].data) {
      expect(row.categoriaId).toBe(deudaId);
    }
  });

  it('un usuario que ya tiene un patrón con ese texto no recibe un duplicado', async () => {
    // Seed: catálogo completo, pero le falta la categoría Deuda (y por lo
    // tanto también deberían faltarle sus patrones) — salvo que el usuario
    // YA tiene 'pago deuda tarjeta' registrado con otro texto/categoría
    // (caso legítimo aunque inusual: el usuario lo creó a mano).
    const seed = seedCatalogoCompleto();
    seed.categorias = seed.categorias.filter((c) => c.nombre !== 'Deuda');
    // 'pago deuda tarjeta' ya existe; 'sobregiro' no.
    seed.patrones = seed.patrones.filter((p) => p.patron !== 'sobregiro');

    const { client, patronCreateManyCalls } = makeFakeClient(seed);

    const summary = await runBackfillCatalogo(client, {
      userId: USER_ID,
      dryRun: false,
    });

    expect(summary.patronesInsertados).toEqual(['sobregiro']);
    const insertedTexts = patronCreateManyCalls[0].data.map((d) => d.patron);
    expect(insertedTexts).toEqual(['sobregiro']);
    expect(insertedTexts).not.toContain('pago deuda tarjeta');
  });
});

describe('runBackfillCatalogo — idempotencia (unit, sin BD)', () => {
  it('una segunda corrida sobre el estado resultante de la primera inserta 0', async () => {
    const seed = seedCatalogoCompleto();
    seed.categorias = seed.categorias.filter(
      (c) => c.nombre !== 'Deuda' && c.nombre !== 'Desconocido',
    );
    seed.patrones = seed.patrones.filter(
      (p) => p.patron !== 'pago deuda tarjeta' && p.patron !== 'sobregiro',
    );

    const { client } = makeFakeClient(seed);

    const primera = await runBackfillCatalogo(client, {
      userId: USER_ID,
      dryRun: false,
    });
    expect(primera.categoriasInsertadas.length).toBeGreaterThan(0);
    expect(primera.patronesInsertados.length).toBeGreaterThan(0);

    const segunda = await runBackfillCatalogo(client, {
      userId: USER_ID,
      dryRun: false,
    });

    expect(segunda.categoriasInsertadas).toEqual([]);
    expect(segunda.patronesInsertados).toEqual([]);
  });
});

describe('runBackfillCatalogo — orden dentro de la transacción (unit, sin BD)', () => {
  it('crea categorías antes de leer ids y antes de crear patrones (la FK compuesta lo exige)', async () => {
    const seed = seedCatalogoCompleto();
    seed.categorias = seed.categorias.filter((c) => c.nombre !== 'Deuda');
    seed.patrones = seed.patrones.filter(
      (p) => p.patron !== 'pago deuda tarjeta' && p.patron !== 'sobregiro',
    );

    const { client, callOrder } = makeFakeClient(seed);

    await runBackfillCatalogo(client, { userId: USER_ID, dryRun: false });

    const categoriaCreateIndex = callOrder.indexOf('categoria.createMany');
    const categoriaFindIndex = callOrder.indexOf('categoria.findMany');
    const patronCreateIndex = callOrder.indexOf(
      'patronClasificacion.createMany',
    );

    expect(categoriaCreateIndex).toBeGreaterThanOrEqual(0);
    expect(categoriaFindIndex).toBeGreaterThan(categoriaCreateIndex);
    expect(patronCreateIndex).toBeGreaterThan(categoriaFindIndex);
  });
});

describe('runBackfillCatalogo — --dry-run (unit, sin BD)', () => {
  it('no escribe nada y aun así reporta lo que insertaría', async () => {
    const seed = seedCatalogoCompleto();
    seed.categorias = seed.categorias.filter(
      (c) => c.nombre !== 'Deuda' && c.nombre !== 'Desconocido',
    );
    seed.patrones = seed.patrones.filter(
      (p) => p.patron !== 'pago deuda tarjeta' && p.patron !== 'sobregiro',
    );

    const {
      client,
      categoriaCreateManyCalls,
      patronCreateManyCalls,
      getTransactionCalls,
    } = makeFakeClient(seed);

    const summary = await runBackfillCatalogo(client, {
      userId: USER_ID,
      dryRun: true,
    });

    expect(categoriaCreateManyCalls).toHaveLength(0);
    expect(patronCreateManyCalls).toHaveLength(0);
    expect(getTransactionCalls()).toBe(0);

    expect(summary.categoriasInsertadas).toEqual(
      expect.arrayContaining([
        'Deuda (Necesidades)',
        'Desconocido (Necesidades)',
        'Desconocido (Deseos)',
        'Desconocido (Ahorro)',
      ]),
    );
    expect(summary.patronesInsertados.sort()).toEqual(
      ['pago deuda tarjeta', 'sobregiro'].sort(),
    );
  });
});

describe('backfill-catalogo-faltante — main() gates (unit, sin BD)', () => {
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

  it('se rehúsa a correr sin --user (no llega a leer env ni a conectar a Prisma)', async () => {
    await expect(main(['--dry-run'])).rejects.toThrow(/--user/);
  });

  it('se rehúsa a correr sin ALLOW_DESTRUCTIVE_DB=1 (no llega a conectar a Prisma)', async () => {
    delete process.env.ALLOW_DESTRUCTIVE_DB;
    process.env.DATABASE_URL = 'postgres://x@dev-host/db';
    delete process.env.DIRECT_URL;

    await expect(main(['--user', USER_ID])).rejects.toThrow(
      /ALLOW_DESTRUCTIVE_DB/,
    );
  });
});
