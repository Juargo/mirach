import { describe, it, expect, vi } from 'vitest';
import {
  CATEGORIA_TEMPLATE,
  CATEGORIA_TEMPLATE_SIZE,
  PATRON_TEMPLATE,
  PATRON_TEMPLATE_SIZE,
  copiarCatalogoTemplate,
  assertSinNombresDuplicados,
  type CatalogoTemplateClient,
} from './catalogo-template';
import { Bucket } from '../../domain/value-objects/bucket';
import { BUCKET_IDS } from './bucket-ids';

/**
 * CATEGORIA_TEMPLATE — pinning test (ADR-037/D-02).
 *
 * Antes de este cambio la plantilla se DERIVABA de `Object.values(Categoria)`
 * (un enum cerrado); tras el retiro del enum, la plantilla es la única
 * fuente que fija qué 8 categorías y qué bucket llevan — este test las FIJA
 * por nombre+bucket. Editar la plantilla ahora requiere editar este test a
 * propósito, que es exactamente el punto (design.md §8.3).
 */
describe('CATEGORIA_TEMPLATE', () => {
  const ESPERADAS: ReadonlyArray<{ nombre: string; bucket: Bucket }> = [
    { nombre: 'Supermercado', bucket: Bucket.Necesidades },
    { nombre: 'Combustible', bucket: Bucket.Necesidades },
    { nombre: 'Farmacia', bucket: Bucket.Necesidades },
    { nombre: 'Salud', bucket: Bucket.Necesidades },
    { nombre: 'Transporte', bucket: Bucket.Necesidades },
    { nombre: 'Streaming', bucket: Bucket.Deseos },
    { nombre: 'Delivery', bucket: Bucket.Deseos },
    { nombre: 'Ahorro', bucket: Bucket.Ahorro },
  ];

  it('pins exactly 8 categorías por nombre+bucket', () => {
    expect(CATEGORIA_TEMPLATE_SIZE).toBe(8);
    expect(CATEGORIA_TEMPLATE).toHaveLength(CATEGORIA_TEMPLATE_SIZE);
    const actual = CATEGORIA_TEMPLATE.map((entry) => ({
      nombre: entry.nombre,
      bucket: entry.bucket,
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
});

/**
 * assertSinNombresDuplicados — ADR-042 D-11. `idPorNombre` in
 * `copiarCatalogoTemplate` is keyed by `nombre` alone; a cross-bucket
 * duplicate in `CATEGORIA_TEMPLATE` would silently make `PATRON_TEMPLATE`
 * resolve to whichever bucket wrote last (last-write-wins), attaching
 * patrones to the wrong categoría for every new user. This guard fails
 * loudly at import time instead.
 */
describe('assertSinNombresDuplicados (ADR-042, D-11)', () => {
  it('the current CATEGORIA_TEMPLATE has no cross-bucket duplicate — passes', () => {
    expect(() => assertSinNombresDuplicados(CATEGORIA_TEMPLATE)).not.toThrow();
  });

  it('a synthetic template with a cross-bucket duplicate throws at construction', () => {
    const conDuplicado = [
      { nombre: 'Transporte', bucket: Bucket.Necesidades },
      { nombre: 'Transporte', bucket: Bucket.Deseos },
    ] as const;

    expect(() => assertSinNombresDuplicados(conDuplicado)).toThrow(
      /nombre repetido/,
    );
  });
});

describe('PATRON_TEMPLATE', () => {
  it('cada entrada referencia un nombre de categoría que existe en la plantilla', () => {
    const nombresTemplate = new Set(
      CATEGORIA_TEMPLATE.map((entry) => entry.nombre),
    );
    for (const entry of PATRON_TEMPLATE) {
      expect(nombresTemplate.has(entry.categoria)).toBe(true);
    }
  });

  it('pattern texts are unique (D-08 tie-break depends on it)', () => {
    const patrones = PATRON_TEMPLATE.map((entry) => entry.patron);
    expect(new Set(patrones).size).toBe(patrones.length);
  });

  it('size is derived from the array and matches the current PATRON_CATALOG count (20)', () => {
    expect(PATRON_TEMPLATE_SIZE).toBe(20);
    expect(PATRON_TEMPLATE).toHaveLength(PATRON_TEMPLATE_SIZE);
  });
});

/** Minimal fake satisfying CatalogoTemplateClient — no real Prisma involved. */
function makeFakeClient(overrides?: { rejectCategoriaCreateMany?: boolean }) {
  const createdCategorias: Array<{
    userId: string;
    nombre: string;
    bucketId: string;
  }> = [];
  const createdPatrones: Array<{
    userId: string;
    patron: string;
    matchType: string;
    categoriaId: string;
    prioridad: number;
  }> = [];
  const categoriaRows: Array<{ id: string; nombre: string }> = [];

  const client = {
    categoria: {
      createMany: vi.fn(
        async ({
          data,
        }: {
          data: Array<{ userId: string; nombre: string; bucketId: string }>;
        }) => {
          if (overrides?.rejectCategoriaCreateMany) {
            throw new Error('db down');
          }
          data.forEach((row, index) => {
            const id = `gen-categoria-${index}`;
            createdCategorias.push(row);
            categoriaRows.push({ id, nombre: row.nombre });
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
