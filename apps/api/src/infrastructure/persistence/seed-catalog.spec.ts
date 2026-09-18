import {
  runSeed,
  PATRON_CATALOG_SIZE,
  CATEGORIA_CATALOG_SIZE,
} from '../../../prisma/seed';
import { CATEGORIA_IDS } from './categoria-ids';
import { BUCKET_IDS } from './bucket-ids';
import { USER_ID_FIJO } from './constants';
import {
  CATEGORIA_TEMPLATE,
  CATEGORIA_TEMPLATE_SIZE,
  claveCategoria,
  type CategoriaTemplateClave,
  type CategoriaTemplateNombre,
} from './catalogo-template';
import { Bucket } from '../../domain/value-objects/bucket';
import { buildTestEnv } from '../../../test/support/env.fixture';

/**
 * Mapa nombre → bucket derivado de CATEGORIA_TEMPLATE (ADR-037/D-02) —
 * reemplaza el `CATEGORIA_BUCKET` del enum retirado como fuente de verdad
 * para verificar que el seed escribió el `bucketId` correcto.
 */
const BUCKET_DE_TEMPLATE: Record<CategoriaTemplateNombre, Bucket> =
  Object.fromEntries(
    CATEGORIA_TEMPLATE.map((entry) => [entry.nombre, entry.bucket]),
  ) as Record<CategoriaTemplateNombre, Bucket>;

/**
 * Seed-integrity unit tests (CAT-01, CAT-04) — no DB involved.
 *
 * `runSeed` only depends on a structural subset of PrismaClient (SeedClient);
 * this fake reproduces upsert-by-id semantics in memory so the seed's
 * idempotency and the Categoria/CATEGORIA_BUCKET/CATEGORIA_IDS invariants
 * can be tested without a real Postgres connection (mirrors the project's
 * pure-domain-test posture, ADR-015).
 */
/**
 * Mapa nombre → icono default derivado de CATEGORIA_TEMPLATE (ADR-045
 * D-06/D-09) — usado para verificar que el seed escribió el `icono`
 * esperado sin re-hardcodear la lista en el test.
 */
const ICONO_DE_TEMPLATE: Record<CategoriaTemplateNombre, string> =
  Object.fromEntries(
    CATEGORIA_TEMPLATE.map((entry) => [entry.nombre, entry.icono]),
  ) as Record<CategoriaTemplateNombre, string>;

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
      const row = existing ? { ...existing, ...update } : create;
      rows.set(where.id, row);
      return row;
    },
    count: async () => rows.size,
  };
}

function makeFakeSeedClient() {
  const user = makeUpsertableStore<{ id: string }>();
  const account = makeUpsertableStore<{ id: string }>();
  const bucketPresupuesto = makeUpsertableStore<{
    id: string;
    nombre: string;
  }>();
  const patronClasificacion = makeUpsertableStore<{
    id: string;
    patron: string;
    matchType: string;
    categoriaId: string;
    prioridad: number;
    userId?: string;
  }>();
  const categoria = makeUpsertableStore<{
    id: string;
    nombre: string;
    bucketId: string;
    userId?: string;
    icono?: string | null;
  }>();

  return {
    prisma: {
      user: { upsert: user.upsert },
      account: { upsert: account.upsert },
      bucketPresupuesto: { upsert: bucketPresupuesto.upsert },
      patronClasificacion: { upsert: patronClasificacion.upsert },
      categoria: { upsert: categoria.upsert },
    } as any,
    stores: {
      user,
      account,
      bucketPresupuesto,
      patronClasificacion,
      categoria,
    },
  };
}

describe('seed — catálogo de Categoria (CAT-01, CAT-04, unit, sin BD)', () => {
  // US-035 Slice 2: runSeed() ahora SIEMPRE cifra Account.numeroCuenta +
  // computa su blind index (ver docstring de runSeed) — requiere
  // process.env.ENCRYPTION_KEY incluso en este spec sin BD real. Se usa la
  // clave fija de test/support/env.fixture.ts y se restaura el valor
  // original después, para no filtrar estado entre archivos de test.
  const originalEncryptionKey = process.env.ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = buildTestEnv().ENCRYPTION_KEY;
  });

  afterAll(() => {
    process.env.ENCRYPTION_KEY = originalEncryptionKey;
  });

  it('CATEGORIA_IDS cubre exactamente los pares (bucket, nombre) de la plantilla (ADR-042)', () => {
    expect(Object.keys(CATEGORIA_IDS)).toHaveLength(CATEGORIA_TEMPLATE_SIZE);
    for (const entry of CATEGORIA_TEMPLATE) {
      const id =
        CATEGORIA_IDS[
          claveCategoria(entry.bucket, entry.nombre) as CategoriaTemplateClave
        ];
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    }
  });

  it('CATEGORIA_CATALOG_SIZE coincide con el tamaño real del catálogo (mirror de PATRON_CATALOG_SIZE)', () => {
    expect(CATEGORIA_CATALOG_SIZE).toBe(CATEGORIA_TEMPLATE_SIZE);
  });

  it('sembrar produce cada Categoria.bucketId === BUCKET_IDS[bucket de la plantilla]', async () => {
    const { prisma, stores } = makeFakeSeedClient();
    await runSeed(prisma);

    expect(stores.categoria.rows.size).toBe(CATEGORIA_CATALOG_SIZE);
    for (const row of stores.categoria.rows.values()) {
      const categoriaEsperada = row.nombre as CategoriaTemplateNombre;
      const bucketEsperado = BUCKET_DE_TEMPLATE[categoriaEsperada];
      expect(row.bucketId).toBe(BUCKET_IDS[bucketEsperado]);
      expect(row.id).toBe(
        CATEGORIA_IDS[
          claveCategoria(
            bucketEsperado,
            categoriaEsperada,
          ) as CategoriaTemplateClave
        ],
      );
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

  // categoria-iconografia (ADR-045 D-06): cada Categoria sembrada carga el
  // icono default de CATEGORIA_TEMPLATE.
  it('sembrar produce cada Categoria.icono === default de la plantilla (CATICO-04)', async () => {
    const { prisma, stores } = makeFakeSeedClient();
    await runSeed(prisma);

    expect(stores.categoria.rows.size).toBe(CATEGORIA_CATALOG_SIZE);
    for (const row of stores.categoria.rows.values()) {
      const nombre = row.nombre as CategoriaTemplateNombre;
      expect(row.icono).toBe(ICONO_DE_TEMPLATE[nombre]);
    }
  });

  // categoria-iconografia (ADR-045 D-09): `icono` viaja SOLO en `create` —
  // un `update` de re-siembra nunca debe pisar un icono editado a mano por
  // el usuario bootstrap real.
  it('re-sembrar no sobrescribe un icono editado a mano (D-09, icono solo en create)', async () => {
    const { prisma, stores } = makeFakeSeedClient();
    await runSeed(prisma);

    const primeraFila = [...stores.categoria.rows.values()][0];
    stores.categoria.rows.set(primeraFila.id, {
      ...primeraFila,
      icono: 'house',
    });

    await runSeed(prisma);

    const filaTrasResiembra = stores.categoria.rows.get(primeraFila.id)!;
    expect(filaTrasResiembra.icono).toBe('house');
  });

  // US-037 (3.1): cada fila del catálogo del usuario bootstrap queda marcada
  // con userId: USER_ID_FIJO — la plantilla es id-free (D-01), pero el seed
  // (D-07) es el único escritor que estampa el owner fijo.
  it('cada Categoria y cada PatronClasificacion sembrados quedan con userId: USER_ID_FIJO (US-037 D-07)', async () => {
    const { prisma, stores } = makeFakeSeedClient();
    await runSeed(prisma);

    expect(stores.categoria.rows.size).toBeGreaterThan(0);
    for (const row of stores.categoria.rows.values()) {
      expect(row.userId).toBe(USER_ID_FIJO);
    }

    expect(stores.patronClasificacion.rows.size).toBeGreaterThan(0);
    for (const row of stores.patronClasificacion.rows.values()) {
      expect(row.userId).toBe(USER_ID_FIJO);
    }
  });

  // US-037 (3.1): re-sembrar no debe reescribir el owner de una fila existente
  // — userId solo viaja en `create`, nunca en `update` (design.md §7).
  it('re-sembrar no mueve el userId de una fila ya existente (US-037)', async () => {
    const { prisma, stores } = makeFakeSeedClient();
    await runSeed(prisma);
    await runSeed(prisma);

    for (const row of stores.categoria.rows.values()) {
      expect(row.userId).toBe(USER_ID_FIJO);
    }
    for (const row of stores.patronClasificacion.rows.values()) {
      expect(row.userId).toBe(USER_ID_FIJO);
    }
  });

  // US-037 (3.1): los ids fijos de patrones sobreviven la rebuild desde
  // PATRON_TEMPLATE — un id conocido de la era pre-US-037 debe seguir
  // presente y sin duplicados (idempotencia + estabilidad de ids, CA-02).
  it('los ids fijos de patrones (era pre-US-037) siguen presentes tras la rebuild desde PATRON_TEMPLATE', async () => {
    const { prisma, stores } = makeFakeSeedClient();
    await runSeed(prisma);

    const patronLider = stores.patronClasificacion.rows.get('pat-lider');
    expect(patronLider).toBeDefined();
    expect(patronLider?.patron).toBe('lider');
    expect(patronLider?.categoriaId).toBe(
      CATEGORIA_IDS['Necesidades:Supermercado'],
    );
  });
});
