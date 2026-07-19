import {
  runSeed,
  PATRON_CATALOG_SIZE,
  CATEGORIA_CATALOG_SIZE,
} from '../../../prisma/seed';
import { CATEGORIA_IDS } from './categoria-ids';
import { BUCKET_IDS } from './bucket-ids';
import { Categoria, CATEGORIA_BUCKET } from '../../domain/value-objects/categoria';

/**
 * Seed-integrity unit tests (CAT-01, CAT-04) — no DB involved.
 *
 * `runSeed` only depends on a structural subset of PrismaClient (SeedClient);
 * this fake reproduces upsert-by-id semantics in memory so the seed's
 * idempotency and the Categoria/CATEGORIA_BUCKET/CATEGORIA_IDS invariants
 * can be tested without a real Postgres connection (mirrors the project's
 * pure-domain-test posture, ADR-015).
 */
function makeUpsertableStore<T extends { id: string }>() {
  const rows = new Map<string, T>();
  return {
    rows,
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { id: string };
      create: T;
      update: Partial<T>;
    }) => {
      const existing = rows.get(where.id);
      const row = existing ? ({ ...existing, ...update } as T) : create;
      rows.set(where.id, row);
      return row;
    },
    count: async () => rows.size,
  };
}

function makeFakeSeedClient() {
  const user = makeUpsertableStore<{ id: string }>();
  const account = makeUpsertableStore<{ id: string }>();
  const bucketPresupuesto = makeUpsertableStore<{ id: string; nombre: string }>();
  const patronClasificacion = makeUpsertableStore<{
    id: string;
    patron: string;
    matchType: string;
    categoriaId: string;
    prioridad: number;
  }>();
  const categoria = makeUpsertableStore<{ id: string; nombre: string; bucketId: string }>();

  return {
    prisma: {
      user: { upsert: user.upsert },
      account: { upsert: account.upsert },
      bucketPresupuesto: { upsert: bucketPresupuesto.upsert },
      patronClasificacion: { upsert: patronClasificacion.upsert },
      categoria: { upsert: categoria.upsert },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    stores: { user, account, bucketPresupuesto, patronClasificacion, categoria },
  };
}

describe('seed — catálogo de Categoria (CAT-01, CAT-04, unit, sin BD)', () => {
  it('CATEGORIA_IDS cubre exactamente las 8 categorías del enum', () => {
    expect(Object.keys(CATEGORIA_IDS)).toHaveLength(Object.values(Categoria).length);
    for (const categoria of Object.values(Categoria)) {
      expect(typeof CATEGORIA_IDS[categoria]).toBe('string');
      expect(CATEGORIA_IDS[categoria].length).toBeGreaterThan(0);
    }
  });

  it('CATEGORIA_CATALOG_SIZE coincide con el tamaño real del catálogo (mirror de PATRON_CATALOG_SIZE)', () => {
    expect(CATEGORIA_CATALOG_SIZE).toBe(Object.values(Categoria).length);
  });

  it('sembrar produce cada Categoria.bucketId === BUCKET_IDS[CATEGORIA_BUCKET[nombre]]', async () => {
    const { prisma, stores } = makeFakeSeedClient();
    await runSeed(prisma);

    expect(stores.categoria.rows.size).toBe(CATEGORIA_CATALOG_SIZE);
    for (const row of stores.categoria.rows.values()) {
      const categoriaEsperada = row.nombre as Categoria;
      expect(row.bucketId).toBe(BUCKET_IDS[CATEGORIA_BUCKET[categoriaEsperada]]);
      expect(row.id).toBe(CATEGORIA_IDS[categoriaEsperada]);
    }
  });

  it('cada PATRON_CATALOG entry referencia una Categoria válida y esa Categoria pertenece a un bucket real (CAT-02, S2)', async () => {
    const { prisma, stores } = makeFakeSeedClient();
    await runSeed(prisma);

    expect(stores.patronClasificacion.rows.size).toBe(PATRON_CATALOG_SIZE);
    for (const patron of stores.patronClasificacion.rows.values()) {
      expect(patron.categoriaId).toBeTruthy();
      const categoriaRow = stores.categoria.rows.get(patron.categoriaId);
      // S2: PatronClasificacion ya no tiene bucketId propio — el bucket se
      // deriva SIEMPRE de categoria.bucket. Basta con que la Categoria
      // referenciada exista y ya tenga su propio bucketId consistente
      // (verificado por el test anterior, "sembrar produce cada
      // Categoria.bucketId === ...").
      expect(categoriaRow).toBeDefined();
      expect(typeof categoriaRow?.bucketId).toBe('string');
    }
  });

  it('re-sembrar no duplica Categoria (idempotencia, CAT-04)', async () => {
    const { prisma, stores } = makeFakeSeedClient();
    await runSeed(prisma);
    await runSeed(prisma);

    expect(stores.categoria.rows.size).toBe(CATEGORIA_CATALOG_SIZE);
    expect(stores.patronClasificacion.rows.size).toBe(PATRON_CATALOG_SIZE);
  });
});
