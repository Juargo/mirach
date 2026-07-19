import {
  runBackfill,
  main,
  type BackfillClient,
} from '../../../prisma/backfill-categorias';
import { CATEGORIA_IDS } from './categoria-ids';
import { BUCKET_IDS } from './bucket-ids';
import { Categoria } from '../../domain/value-objects/categoria';
import { Bucket } from '../../domain/value-objects/bucket';

/**
 * backfill-categorias — unit tests (CAT-05, sin BD).
 *
 * `runBackfill` solo depende de un subconjunto estructural de PrismaClient
 * (BackfillClient); este fake reproduce findMany/updateMany/$transaction en
 * memoria para poder testear idempotencia, dry-run y el scope
 * `categoriaId IS NULL` sin una conexión Postgres real (mismo patrón que
 * seed-catalog.spec.ts, ADR-015).
 *
 * Los tests gated contra BD real (T3.1-T3.3, idempotencia/dry-run/scope
 * integration) viven en test/backfill-categorias.int-spec.ts.
 */

interface FakePatron {
  id: string;
  patron: string;
  matchType: string;
  prioridad: number;
  categoria: { nombre: string };
}

interface FakeTransaccion {
  id: string;
  descripcion: string;
  cargo: bigint;
  abono: bigint;
  categoriaId: string | null;
  bucketId: string | null;
}

function makeFakeClient(patrones: FakePatron[], transacciones: FakeTransaccion[]) {
  const updateManyCalls: Array<{ ids: string[]; categoriaId: string | null; bucketId: string }> =
    [];

  const client: BackfillClient = {
    patronClasificacion: {
      findMany: async () => patrones,
    },
    transaccion: {
      findMany: async ({ where }: { where: { categoriaId: null } }) => {
        expect(where).toEqual({ categoriaId: null });
        return transacciones
          .filter((t) => t.categoriaId === null)
          .map((t) => ({
            id: t.id,
            descripcion: t.descripcion,
            cargo: t.cargo,
            abono: t.abono,
            bucketId: t.bucketId,
          }));
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: { in: string[] } };
        data: { categoriaId: string | null; bucketId: string };
      }) => {
        updateManyCalls.push({ ids: where.id.in, ...data });
        let count = 0;
        for (const t of transacciones) {
          if (where.id.in.includes(t.id)) {
            t.categoriaId = data.categoriaId;
            t.bucketId = data.bucketId;
            count++;
          }
        }
        return { count };
      },
    },
    $transaction: async <T>(ops: Promise<T>[]) => Promise.all(ops),
  };

  return { client, updateManyCalls, transacciones };
}

const PAT_LIDER: FakePatron = {
  id: 'pat-lider',
  patron: 'lider',
  matchType: 'CONTAINS',
  prioridad: 10,
  categoria: { nombre: Categoria.Supermercado },
};

describe('runBackfill — clasificación (CAT-05, unit, sin BD)', () => {
  it('escribe categoriaId + bucketId derivado para una fila que matchea un patrón', async () => {
    const { client, updateManyCalls, transacciones } = makeFakeClient(
      [PAT_LIDER],
      [
        {
          id: 'tx-1',
          descripcion: 'Compra Lider',
          cargo: 9500n,
          abono: 0n,
          categoriaId: null,
          bucketId: null,
        },
      ],
    );

    const summary = await runBackfill(client, { dryRun: false });

    expect(summary.totalRows).toBe(1);
    expect(summary.porCategoria[Categoria.Supermercado]).toBe(1);
    expect(summary.bucketChanges).toBe(1);
    expect(updateManyCalls).toHaveLength(1);
    expect(updateManyCalls[0]).toMatchObject({
      ids: ['tx-1'],
      categoriaId: CATEGORIA_IDS[Categoria.Supermercado],
      bucketId: BUCKET_IDS[Bucket.Necesidades],
    });
    expect(transacciones[0].categoriaId).toBe(CATEGORIA_IDS[Categoria.Supermercado]);
    expect(transacciones[0].bucketId).toBe(BUCKET_IDS[Bucket.Necesidades]);
  });

  it('una fila sin match aterriza en SinCategoria con categoriaId null (no inventa datos)', async () => {
    const { client, updateManyCalls, transacciones } = makeFakeClient(
      [PAT_LIDER],
      [
        {
          id: 'tx-2',
          descripcion: 'Compra en un local desconocido',
          cargo: 3000n,
          abono: 0n,
          categoriaId: null,
          bucketId: null,
        },
      ],
    );

    const summary = await runBackfill(client, { dryRun: false });

    expect(summary.porCategoria['null']).toBe(1);
    expect(updateManyCalls[0]).toMatchObject({
      ids: ['tx-2'],
      categoriaId: null,
      bucketId: BUCKET_IDS[Bucket.SinCategoria],
    });
    expect(transacciones[0].categoriaId).toBeNull();
    expect(transacciones[0].bucketId).toBe(BUCKET_IDS[Bucket.SinCategoria]);
  });

  it('la regla Ingreso no consulta patrones y deriva bucket Ingreso con categoriaId null', async () => {
    const { client, updateManyCalls } = makeFakeClient(
      [PAT_LIDER],
      [
        {
          id: 'tx-3',
          descripcion: 'Deposito sueldo',
          cargo: 0n,
          abono: 1500000n,
          categoriaId: null,
          bucketId: null,
        },
      ],
    );

    await runBackfill(client, { dryRun: false });

    expect(updateManyCalls[0]).toMatchObject({
      ids: ['tx-3'],
      categoriaId: null,
      bucketId: BUCKET_IDS[Bucket.Ingreso],
    });
  });

  it('scope = categoriaId IS NULL: no selecciona ni toca filas ya categorizadas manualmente', async () => {
    const { client, updateManyCalls, transacciones } = makeFakeClient(
      [PAT_LIDER],
      [
        {
          id: 'tx-manual',
          descripcion: 'Compra Lider',
          cargo: 9500n,
          abono: 0n,
          categoriaId: CATEGORIA_IDS[Categoria.Ahorro], // manually reclassified, would NOT match "lider"→Supermercado
          bucketId: BUCKET_IDS[Bucket.Ahorro],
        },
      ],
    );

    const summary = await runBackfill(client, { dryRun: false });

    expect(summary.totalRows).toBe(0);
    expect(updateManyCalls).toHaveLength(0);
    // Untouched — manual edit preserved.
    expect(transacciones[0].categoriaId).toBe(CATEGORIA_IDS[Categoria.Ahorro]);
    expect(transacciones[0].bucketId).toBe(BUCKET_IDS[Bucket.Ahorro]);
  });

  it('agrupa por (categoria, bucket): dos categorías distintas al mismo bucket generan updateMany separados', async () => {
    const PAT_COPEC: FakePatron = {
      id: 'pat-copec',
      patron: 'copec',
      matchType: 'CONTAINS',
      prioridad: 15,
      categoria: { nombre: Categoria.Combustible },
    };
    const { client, updateManyCalls } = makeFakeClient(
      [PAT_LIDER, PAT_COPEC],
      [
        {
          id: 'tx-lider',
          descripcion: 'Compra Lider',
          cargo: 9500n,
          abono: 0n,
          categoriaId: null,
          bucketId: null,
        },
        {
          id: 'tx-copec',
          descripcion: 'Compra Copec',
          cargo: 20000n,
          abono: 0n,
          categoriaId: null,
          bucketId: null,
        },
      ],
    );

    await runBackfill(client, { dryRun: false });

    // Both derive to Bucket.Necesidades but have different categoriaId — must be two groups.
    expect(updateManyCalls).toHaveLength(2);
    const categoriaIds = updateManyCalls.map((c) => c.categoriaId).sort();
    expect(categoriaIds).toEqual(
      [CATEGORIA_IDS[Categoria.Combustible], CATEGORIA_IDS[Categoria.Supermercado]].sort(),
    );
  });
});

const PAT_NETFLIX: FakePatron = {
  id: 'pat-netflix',
  patron: 'netflix',
  matchType: 'CONTAINS',
  prioridad: 20,
  categoria: { nombre: Categoria.Streaming },
};

describe('runBackfill — preservación de bucket existente (fix/backfill-preserve-bucket)', () => {
  it('fila ya bucketeada (Necesidades) cuyo match deriva al MISMO bucket: agrega categoriaId, bucket sin cambios', async () => {
    const { client, updateManyCalls, transacciones } = makeFakeClient(
      [PAT_LIDER],
      [
        {
          id: 'tx-consistente',
          descripcion: 'Compra Lider',
          cargo: 9500n,
          abono: 0n,
          categoriaId: null,
          bucketId: BUCKET_IDS[Bucket.Necesidades],
        },
      ],
    );

    const summary = await runBackfill(client, { dryRun: false });

    expect(updateManyCalls).toHaveLength(1);
    expect(updateManyCalls[0]).toMatchObject({
      ids: ['tx-consistente'],
      categoriaId: CATEGORIA_IDS[Categoria.Supermercado],
      bucketId: BUCKET_IDS[Bucket.Necesidades],
    });
    expect(transacciones[0].categoriaId).toBe(CATEGORIA_IDS[Categoria.Supermercado]);
    // Bucket unchanged — same value it already had.
    expect(transacciones[0].bucketId).toBe(BUCKET_IDS[Bucket.Necesidades]);
    expect(summary.categoriaAgregadaBucketPreservado).toBe(1);
    expect(summary.bucketAsignadoDesdeNulo).toBe(0);
    // Invariant: an already-bucketed row never counts as a bucket change.
    expect(summary.bucketChanges).toBe(0);
  });

  it('fila ya bucketeada (Necesidades) cuyo match deriva a OTRO bucket (Deseos): NO se mueve, categoriaId queda null', async () => {
    const { client, updateManyCalls, transacciones } = makeFakeClient(
      [PAT_NETFLIX],
      [
        {
          id: 'tx-inconsistente',
          descripcion: 'Pago Netflix',
          cargo: 8000n,
          abono: 0n,
          categoriaId: null,
          bucketId: BUCKET_IDS[Bucket.Necesidades],
        },
      ],
    );

    const summary = await runBackfill(client, { dryRun: false });

    // Row is never moved — no write at all for this row.
    expect(updateManyCalls).toHaveLength(0);
    expect(transacciones[0].categoriaId).toBeNull();
    expect(transacciones[0].bucketId).toBe(BUCKET_IDS[Bucket.Necesidades]);
    expect(summary.categoriaAgregadaBucketPreservado).toBe(0);
    expect(summary.bucketAsignadoDesdeNulo).toBe(0);
    expect(summary.bucketChanges).toBe(0);
    // Classification outcome is still reported for visibility, even though unwritten.
    expect(summary.porCategoria[Categoria.Streaming]).toBe(1);
  });

  it('fila ya bucketeada como SinCategoria con cualquier match: se queda en SinCategoria, categoriaId null', async () => {
    const { client, updateManyCalls, transacciones } = makeFakeClient(
      [PAT_LIDER],
      [
        {
          id: 'tx-sincategoria',
          descripcion: 'Compra Lider',
          cargo: 9500n,
          abono: 0n,
          categoriaId: null,
          bucketId: BUCKET_IDS[Bucket.SinCategoria],
        },
      ],
    );

    const summary = await runBackfill(client, { dryRun: false });

    expect(updateManyCalls).toHaveLength(0);
    expect(transacciones[0].categoriaId).toBeNull();
    expect(transacciones[0].bucketId).toBe(BUCKET_IDS[Bucket.SinCategoria]);
    expect(summary.categoriaAgregadaBucketPreservado).toBe(0);
    expect(summary.bucketChanges).toBe(0);
  });

  it('fila ya bucketeada sin ningún match: queda completamente intacta', async () => {
    const { client, updateManyCalls, transacciones } = makeFakeClient(
      [PAT_LIDER],
      [
        {
          id: 'tx-sin-match',
          descripcion: 'Compra en un local desconocido',
          cargo: 3000n,
          abono: 0n,
          categoriaId: null,
          bucketId: BUCKET_IDS[Bucket.Necesidades],
        },
      ],
    );

    const summary = await runBackfill(client, { dryRun: false });

    expect(updateManyCalls).toHaveLength(0);
    expect(transacciones[0]).toEqual({
      id: 'tx-sin-match',
      descripcion: 'Compra en un local desconocido',
      cargo: 3000n,
      abono: 0n,
      categoriaId: null,
      bucketId: BUCKET_IDS[Bucket.Necesidades],
    });
    expect(summary.categoriaAgregadaBucketPreservado).toBe(0);
    expect(summary.bucketAsignadoDesdeNulo).toBe(0);
    expect(summary.bucketChanges).toBe(0);
  });

  it('invariante: en un dataset mixto ninguna fila ya bucketeada cambia de bucket y el dinero (cargo/abono) nunca se toca', async () => {
    const { client, transacciones } = makeFakeClient(
      [PAT_LIDER, PAT_NETFLIX],
      [
        // Already-bucketed, consistent match → categoriaId added, bucket preserved.
        {
          id: 'tx-a',
          descripcion: 'Compra Lider',
          cargo: 9500n,
          abono: 0n,
          categoriaId: null,
          bucketId: BUCKET_IDS[Bucket.Necesidades],
        },
        // Already-bucketed, inconsistent match → untouched.
        {
          id: 'tx-b',
          descripcion: 'Pago Netflix',
          cargo: 8000n,
          abono: 0n,
          categoriaId: null,
          bucketId: BUCKET_IDS[Bucket.Ahorro],
        },
        // Never-bucketed → full classification.
        {
          id: 'tx-c',
          descripcion: 'Compra Lider',
          cargo: 5000n,
          abono: 0n,
          categoriaId: null,
          bucketId: null,
        },
      ],
    );

    const bucketsAntes = new Map(transacciones.map((t) => [t.id, t.bucketId]));
    const dineroAntes = new Map(transacciones.map((t) => [t.id, { cargo: t.cargo, abono: t.abono }]));

    await runBackfill(client, { dryRun: false });

    for (const t of transacciones) {
      expect(t.cargo).toEqual(dineroAntes.get(t.id)!.cargo);
      expect(t.abono).toEqual(dineroAntes.get(t.id)!.abono);
      // Rows that already had a bucket before the run must keep that exact bucket.
      const bucketAntes = bucketsAntes.get(t.id);
      if (bucketAntes !== null) {
        expect(t.bucketId).toBe(bucketAntes);
      }
    }

    // tx-a gains a categoria, bucket unchanged.
    expect(transacciones.find((t) => t.id === 'tx-a')?.categoriaId).toBe(
      CATEGORIA_IDS[Categoria.Supermercado],
    );
    // tx-b untouched.
    expect(transacciones.find((t) => t.id === 'tx-b')?.categoriaId).toBeNull();
    // tx-c gets full classification (bucket previously null).
    expect(transacciones.find((t) => t.id === 'tx-c')?.categoriaId).toBe(
      CATEGORIA_IDS[Categoria.Supermercado],
    );
    expect(transacciones.find((t) => t.id === 'tx-c')?.bucketId).toBe(BUCKET_IDS[Bucket.Necesidades]);
  });
});

describe('runBackfill — idempotencia (CAT-05, unit, sin BD)', () => {
  it('re-ejecutar sobre el mismo dataset produce el mismo estado (no-op la segunda vez)', async () => {
    const { client, transacciones } = makeFakeClient(
      [PAT_LIDER],
      [
        {
          id: 'tx-1',
          descripcion: 'Compra Lider',
          cargo: 9500n,
          abono: 0n,
          categoriaId: null,
          bucketId: null,
        },
      ],
    );

    await runBackfill(client, { dryRun: false });
    const afterFirstRun = { ...transacciones[0] };

    // Second run: tx-1 now has categoriaId set, so it's out of scope — no-op.
    const summarySecondRun = await runBackfill(client, { dryRun: false });

    expect(summarySecondRun.totalRows).toBe(0);
    expect(transacciones[0]).toEqual(afterFirstRun);
  });
});

describe('runBackfill — dry-run (CAT-05, unit, sin BD)', () => {
  it('--dry-run calcula el resumen pero no escribe nada', async () => {
    const { client, updateManyCalls, transacciones } = makeFakeClient(
      [PAT_LIDER],
      [
        {
          id: 'tx-1',
          descripcion: 'Compra Lider',
          cargo: 9500n,
          abono: 0n,
          categoriaId: null,
          bucketId: null,
        },
      ],
    );

    const summary = await runBackfill(client, { dryRun: true });

    expect(summary.totalRows).toBe(1);
    expect(summary.porCategoria[Categoria.Supermercado]).toBe(1);
    expect(summary.bucketChanges).toBe(1);
    expect(updateManyCalls).toHaveLength(0);
    // Nothing persisted.
    expect(transacciones[0].categoriaId).toBeNull();
    expect(transacciones[0].bucketId).toBeNull();
  });

  it('el bucketChanges preview solo cuenta filas SIN bucket previo (invariante: nunca una fila ya bucketeada)', async () => {
    const { client } = makeFakeClient(
      [PAT_LIDER],
      [
        {
          id: 'tx-already-necesidades',
          descripcion: 'Compra Lider',
          cargo: 9500n,
          abono: 0n,
          categoriaId: null,
          // Already sitting on the bucket it would resolve to (e.g. pre-seeded)
          bucketId: BUCKET_IDS[Bucket.Necesidades],
        },
      ],
    );

    const summary = await runBackfill(client, { dryRun: true });

    expect(summary.totalRows).toBe(1);
    expect(summary.bucketChanges).toBe(0);
    expect(summary.categoriaAgregadaBucketPreservado).toBe(1);
    expect(summary.bucketAsignadoDesdeNulo).toBe(0);
  });

  it('reporta por separado: categoría agregada con bucket preservado vs. bucket asignado desde nulo', async () => {
    const { client } = makeFakeClient(
      [PAT_LIDER],
      [
        {
          id: 'tx-preservado',
          descripcion: 'Compra Lider',
          cargo: 9500n,
          abono: 0n,
          categoriaId: null,
          bucketId: BUCKET_IDS[Bucket.Necesidades],
        },
        {
          id: 'tx-desde-nulo',
          descripcion: 'Compra Lider',
          cargo: 4000n,
          abono: 0n,
          categoriaId: null,
          bucketId: null,
        },
      ],
    );

    const summary = await runBackfill(client, { dryRun: true });

    expect(summary.categoriaAgregadaBucketPreservado).toBe(1);
    expect(summary.bucketAsignadoDesdeNulo).toBe(1);
    // Invariant: bucketChanges only reflects the null-bucket row.
    expect(summary.bucketChanges).toBe(1);
  });
});

describe('backfill-categorias — gate ALLOW_DESTRUCTIVE_DB (T3.4, unit, sin BD)', () => {
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

  it('rechaza cadenas de conexión de producción incluso con el flag activo', async () => {
    process.env.ALLOW_DESTRUCTIVE_DB = '1';
    process.env.DATABASE_URL = 'postgres://x@prod-db.example.com/production';
    delete process.env.DIRECT_URL;
    delete process.env.CONFIRM_PROD_BACKFILL;

    await expect(main([])).rejects.toThrow(/producción/);
  });

  it('rechaza producción aun con el flag activo si CONFIRM_PROD_BACKFILL no está seteado', async () => {
    process.env.ALLOW_DESTRUCTIVE_DB = '1';
    process.env.DATABASE_URL = 'postgres://x@prod-db.example.com/production';
    delete process.env.DIRECT_URL;
    delete process.env.CONFIRM_PROD_BACKFILL;

    await expect(main([])).rejects.toThrow(/producción/);
  });

  it('rechaza producción si CONFIRM_PROD_BACKFILL tiene un valor distinto al esperado', async () => {
    process.env.ALLOW_DESTRUCTIVE_DB = '1';
    process.env.DATABASE_URL = 'postgres://x@prod-db.example.com/production';
    delete process.env.DIRECT_URL;
    process.env.CONFIRM_PROD_BACKFILL = 'algo-distinto';

    await expect(main([])).rejects.toThrow(/producción/);
  });

  it('sin DATABASE_URL/DIRECT_URL definidos, falla antes de intentar conectar', async () => {
    process.env.ALLOW_DESTRUCTIVE_DB = '1';
    delete process.env.DATABASE_URL;
    delete process.env.DIRECT_URL;

    await expect(main([])).rejects.toThrow(/DATABASE_URL|DIRECT_URL/);
  });
});
