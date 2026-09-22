import { describe, it, expect, vi } from 'vitest';
import {
  CATEGORIA_TEMPLATE,
  CATEGORIA_TEMPLATE_SIZE,
  PATRON_TEMPLATE,
  PATRON_TEMPLATE_SIZE,
  copiarCatalogoTemplate,
  assertSinParesDuplicados,
  claveCategoria,
  type CatalogoTemplateClient,
} from './catalogo-template';
import { BUCKET_IDS } from './bucket-ids';
import { Bucket } from '../../domain/value-objects/bucket';
import {
  esIconoCategoria,
  type IconoCategoria,
} from '../../domain/value-objects/icono-categoria';

/**
 * CATEGORIA_TEMPLATE — pinning test (ADR-037/D-02).
 *
 * Antes de este cambio la plantilla se DERIVABA de `Object.values(Categoria)`
 * (un enum cerrado); tras el retiro del enum, la plantilla es la única
 * fuente que fija qué 12 categorías y qué bucket llevan — este test las FIJA
 * por nombre+bucket. Editar la plantilla ahora requiere editar este test a
 * propósito, que es exactamente el punto (design.md §8.3).
 */
describe('CATEGORIA_TEMPLATE', () => {
  const ESPERADAS: ReadonlyArray<{
    nombre: string;
    bucket: Bucket;
    icono: IconoCategoria;
  }> = [
    {
      nombre: 'Supermercado',
      bucket: Bucket.Necesidades,
      icono: 'shopping-cart',
    },
    { nombre: 'Combustible', bucket: Bucket.Necesidades, icono: 'fuel' },
    { nombre: 'Farmacia', bucket: Bucket.Necesidades, icono: 'pill' },
    { nombre: 'Salud', bucket: Bucket.Necesidades, icono: 'heart-pulse' },
    { nombre: 'Transporte', bucket: Bucket.Necesidades, icono: 'bus' },
    { nombre: 'Streaming', bucket: Bucket.Deseos, icono: 'tv' },
    { nombre: 'Delivery', bucket: Bucket.Deseos, icono: 'bike' },
    { nombre: 'Ahorro', bucket: Bucket.Ahorro, icono: 'piggy-bank' },
    {
      nombre: 'Deuda',
      bucket: Bucket.Necesidades,
      icono: 'credit-card',
    },
    // Servicios básicos (luz, agua, gas) — issue #746.
    { nombre: 'Cuentas', bucket: Bucket.Necesidades, icono: 'zap' },
    {
      nombre: 'Internet y telefonía',
      bucket: Bucket.Necesidades,
      icono: 'wifi',
    },
    // Restaurantes / comida fuera de casa y vestuario — issue #746. Sin
    // PATRON_TEMPLATE a propósito (ver docblock de PATRON_TEMPLATE).
    { nombre: 'Comida', bucket: Bucket.Deseos, icono: 'utensils' },
    { nombre: 'Ropa', bucket: Bucket.Deseos, icono: 'shirt' },
    {
      nombre: 'Desconocido',
      bucket: Bucket.Necesidades,
      icono: 'circle-help',
    },
    {
      nombre: 'Desconocido',
      bucket: Bucket.Deseos,
      icono: 'circle-help',
    },
    {
      nombre: 'Desconocido',
      bucket: Bucket.Ahorro,
      icono: 'circle-help',
    },
  ];

  it('pins exactly 16 categorías por nombre+bucket+icono (CATICO-04, D-06 seed list; issue #746)', () => {
    expect(CATEGORIA_TEMPLATE_SIZE).toBe(16);
    expect(CATEGORIA_TEMPLATE).toHaveLength(CATEGORIA_TEMPLATE_SIZE);
    const actual = CATEGORIA_TEMPLATE.map((entry) => ({
      nombre: entry.nombre,
      bucket: entry.bucket,
      icono: entry.icono,
    })).sort((a, b) => a.nombre.localeCompare(b.nombre));
    const esperadas = [...ESPERADAS].sort((a, b) =>
      a.nombre.localeCompare(b.nombre),
    );
    expect(actual).toEqual(esperadas);
  });

  it('cada bucket de la plantilla resuelve a un id físico vía BUCKET_IDS — BUCKET_IDS sigue siendo la única autoridad de ids', () => {
    for (const entry of CATEGORIA_TEMPLATE) {
      expect(BUCKET_IDS[entry.bucket]).toEqual(expect.any(String));
    }
  });

  it('cada icono de la plantilla pertenece a la allowlist curada (CATICO-01)', () => {
    for (const entry of CATEGORIA_TEMPLATE) {
      expect(esIconoCategoria(entry.icono)).toBe(true);
    }
  });
});

/**
 * `Desconocido` — categoria-desconocido. Tres filas homónimas, una por cada
 * bucket ASIGNABLE (Necesidades, Deseos, Ahorro), habilitadas por el
 * re-keyeo por (bucket, nombre) de ADR-042/`assertSinParesDuplicados`. Son
 * de asignación manual exclusivamente: ningún patrón las detecta desde una
 * glosa bancaria, así que el invariante que este bloque fija es que
 * PATRON_TEMPLATE nunca les crece uno.
 */
describe('Categoria "Desconocido" (categoria-desconocido)', () => {
  it('existe exactamente una vez por cada bucket asignable (Necesidades, Deseos, Ahorro)', () => {
    const desconocidas = CATEGORIA_TEMPLATE.filter(
      (entry) => entry.nombre === 'Desconocido',
    );
    expect(desconocidas).toHaveLength(3);
    expect(desconocidas.map((entry) => entry.bucket).sort()).toEqual(
      [Bucket.Necesidades, Bucket.Deseos, Bucket.Ahorro].sort(),
    );
  });

  it('ninguna fila "Desconocido" es referenciada por PATRON_TEMPLATE (asignación manual exclusivamente)', () => {
    const clavesDesconocido = new Set(
      CATEGORIA_TEMPLATE.filter((entry) => entry.nombre === 'Desconocido').map(
        (entry) => claveCategoria(entry.bucket, entry.nombre),
      ),
    );
    for (const patron of PATRON_TEMPLATE) {
      expect(clavesDesconocido.has(patron.categoria)).toBe(false);
    }
  });

  // #778 — la marca de interna. Dos asserts y no uno: uno fija que las tres
  // Desconocido la llevan, el otro que NINGUNA otra la lleva. Sin el segundo,
  // marcar toda la plantilla por error pasaría desapercibido.
  it('las tres "Desconocido" son las ÚNICAS entradas internas de la plantilla', () => {
    const internas = CATEGORIA_TEMPLATE.filter(
      (entry) => 'esInterna' in entry && entry.esInterna,
    );

    expect(internas).toHaveLength(3);
    expect(internas.every((entry) => entry.nombre === 'Desconocido')).toBe(
      true,
    );
    expect(internas.map((entry) => entry.bucket).sort()).toEqual(
      [Bucket.Necesidades, Bucket.Deseos, Bucket.Ahorro].sort(),
    );
  });

  it('ninguna categoría que NO se llame "Desconocido" es interna', () => {
    const noDesconocidas = CATEGORIA_TEMPLATE.filter(
      (entry) => entry.nombre !== 'Desconocido',
    );

    expect(noDesconocidas).toHaveLength(13);
    for (const entry of noDesconocidas) {
      expect('esInterna' in entry && entry.esInterna).toBe(false);
    }
  });
});

/**
 * assertSinParesDuplicados — ADR-042 D-11. `idPorClave` in
 * `copiarCatalogoTemplate` is keyed by the composite `(bucket, nombre)`
 * pair; a duplicate PAIR in `CATEGORIA_TEMPLATE` would silently make
 * `PATRON_TEMPLATE` resolve to whichever row wrote last (last-write-wins),
 * attaching patrones to the wrong categoría for every new user. This guard
 * fails loudly at import time instead. ADR-042 explicitly ALLOWS the same
 * `nombre` to repeat across different buckets — only a repeated PAIR is an
 * error.
 */
describe('assertSinParesDuplicados (ADR-042, D-11)', () => {
  it('the current CATEGORIA_TEMPLATE has no duplicate (bucket, nombre) pair — passes', () => {
    expect(() => assertSinParesDuplicados(CATEGORIA_TEMPLATE)).not.toThrow();
  });

  it('two categorías with the same nombre in DIFFERENT buckets do NOT throw — ADR-042 allows this pair', () => {
    const nombreRepetidoEntreBuckets = [
      { nombre: 'Transporte', bucket: Bucket.Necesidades },
      { nombre: 'Transporte', bucket: Bucket.Deseos },
    ] as const;

    expect(() =>
      assertSinParesDuplicados(nombreRepetidoEntreBuckets),
    ).not.toThrow();
  });

  it('two categorías with the same (bucket, nombre) PAIR throw at construction', () => {
    const parRepetido = [
      { nombre: 'Transporte', bucket: Bucket.Necesidades },
      { nombre: 'Transporte', bucket: Bucket.Necesidades },
    ] as const;

    expect(() => assertSinParesDuplicados(parRepetido)).toThrow(/par repetido/);
  });
});

describe('PATRON_TEMPLATE', () => {
  it('cada entrada referencia una clave bucket:nombre que existe en la plantilla (ADR-042)', () => {
    const clavesTemplate = new Set(
      CATEGORIA_TEMPLATE.map((entry) =>
        claveCategoria(entry.bucket, entry.nombre),
      ),
    );
    for (const entry of PATRON_TEMPLATE) {
      expect(clavesTemplate.has(entry.categoria)).toBe(true);
    }
  });

  it('pattern texts are unique (D-08 tie-break depends on it)', () => {
    const patrones = PATRON_TEMPLATE.map((entry) => entry.patron);
    expect(new Set(patrones).size).toBe(patrones.length);
  });

  it('size is derived from the array and matches the current PATRON_CATALOG count (39, issue #746)', () => {
    expect(PATRON_TEMPLATE_SIZE).toBe(39);
    expect(PATRON_TEMPLATE).toHaveLength(PATRON_TEMPLATE_SIZE);
  });
});

/**
 * Comida / Ropa (issue #746) — decisión del owner: SIN PATRON_TEMPLATE.
 * Los nombres de locales chilenos de comida/vestuario son ambiguos y un
 * patrón malo clasificaría en silencio; se decidirá después con glosas
 * reales. Este guard fija ese invariante igual que el de "Desconocido".
 */
describe('Categoria "Comida" y "Ropa" (issue #746) — sin PATRON_TEMPLATE a propósito', () => {
  it('ningún patrón de PATRON_TEMPLATE referencia Comida ni Ropa', () => {
    const clavesSinPatrones = new Set(
      CATEGORIA_TEMPLATE.filter(
        (entry) => entry.nombre === 'Comida' || entry.nombre === 'Ropa',
      ).map((entry) => claveCategoria(entry.bucket, entry.nombre)),
    );
    expect(clavesSinPatrones.size).toBe(2);
    for (const patron of PATRON_TEMPLATE) {
      expect(clavesSinPatrones.has(patron.categoria)).toBe(false);
    }
  });
});

/** Minimal fake satisfying CatalogoTemplateClient — no real Prisma involved. */
function makeFakeClient(overrides?: { rejectCategoriaCreateMany?: boolean }) {
  const createdCategorias: Array<{
    userId: string;
    nombre: string;
    bucketId: string;
    icono: string | null;
  }> = [];
  const createdPatrones: Array<{
    userId: string;
    patron: string;
    matchType: string;
    categoriaId: string;
    prioridad: number;
  }> = [];
  // bucketId viaja acá porque copiarCatalogoTemplate ahora lo pide en el
  // `select` del findMany real (necesita reconstruir la clave bucket:nombre
  // — ver su docblock); el fake debe reflejar exactamente ese contrato.
  const categoriaRows: Array<{ id: string; nombre: string; bucketId: string }> =
    [];

  const client = {
    categoria: {
      createMany: vi.fn(
        async ({
          data,
        }: {
          data: Array<{
            userId: string;
            nombre: string;
            bucketId: string;
            icono: string | null;
          }>;
        }) => {
          if (overrides?.rejectCategoriaCreateMany) {
            throw new Error('db down');
          }
          data.forEach((row, index) => {
            const id = `gen-categoria-${index}`;
            createdCategorias.push(row);
            categoriaRows.push({
              id,
              nombre: row.nombre,
              bucketId: row.bucketId,
            });
          });
          return { count: data.length };
        },
      ),
      findMany: vi.fn(async () => categoriaRows),
    },
    patronClasificacion: {
      createMany: vi.fn(
        async ({
          data,
        }: {
          data: Array<{
            userId: string;
            patron: string;
            matchType: string;
            categoriaId: string;
            prioridad: number;
          }>;
        }) => {
          createdPatrones.push(...data);
          return { count: data.length };
        },
      ),
    },
    // Deliberately present (and spied) so a test can assert it is never
    // invoked — contract rule 1: the caller owns the transaction boundary.
    $transaction: vi.fn(() => {
      throw new Error(
        'copiarCatalogoTemplate must not open its own $transaction',
      );
    }),
  };

  return {
    client: client as unknown as CatalogoTemplateClient,
    rawClient: client,
    createdCategorias,
    createdPatrones,
    categoriaRows,
  };
}

describe('copiarCatalogoTemplate', () => {
  it('issues exactly 2 createMany calls', async () => {
    const { client, rawClient } = makeFakeClient();

    await copiarCatalogoTemplate(client, 'user-1');

    expect(rawClient.categoria.createMany).toHaveBeenCalledTimes(1);
    expect(rawClient.patronClasificacion.createMany).toHaveBeenCalledTimes(1);
  });

  it('stamps the passed userId on every categoria and patron row', async () => {
    const { client, createdCategorias, createdPatrones } = makeFakeClient();

    await copiarCatalogoTemplate(client, 'user-1');

    expect(createdCategorias).toHaveLength(CATEGORIA_TEMPLATE_SIZE);
    for (const row of createdCategorias) {
      expect(row.userId).toBe('user-1');
    }

    expect(createdPatrones).toHaveLength(PATRON_TEMPLATE_SIZE);
    for (const row of createdPatrones) {
      expect(row.userId).toBe('user-1');
    }
  });

  it('writes each created categoria row with its template-defined default icono (CATICO-04)', async () => {
    const { client, createdCategorias } = makeFakeClient();

    await copiarCatalogoTemplate(client, 'user-1');

    const iconoPorNombre = new Map<string, string>(
      CATEGORIA_TEMPLATE.map((entry) => [entry.nombre, entry.icono]),
    );
    expect(createdCategorias).toHaveLength(CATEGORIA_TEMPLATE_SIZE);
    for (const row of createdCategorias) {
      expect(row.icono).toBe(iconoPorNombre.get(row.nombre));
    }
  });

  it("resolves every pattern's categoriaId via the read-back map", async () => {
    const { client, createdPatrones, categoriaRows } = makeFakeClient();

    await copiarCatalogoTemplate(client, 'user-1');

    const idsGenerados = new Set(categoriaRows.map((row) => row.id));
    for (const row of createdPatrones) {
      expect(idsGenerados.has(row.categoriaId)).toBe(true);
    }
  });

  it('never opens its own $transaction — the caller owns the transaction boundary', async () => {
    const { client, rawClient } = makeFakeClient();

    await copiarCatalogoTemplate(client, 'user-1');

    expect(rawClient.$transaction).not.toHaveBeenCalled();
  });

  it('rejects the promise when the client rejects (no Result wrapping)', async () => {
    const { client } = makeFakeClient({ rejectCategoriaCreateMany: true });

    await expect(copiarCatalogoTemplate(client, 'user-1')).rejects.toThrow(
      'db down',
    );
  });
});
