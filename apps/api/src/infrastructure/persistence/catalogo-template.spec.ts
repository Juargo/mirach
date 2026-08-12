import { describe, it, expect, vi } from 'vitest';
import {
  CATEGORIA_TEMPLATE,
  CATEGORIA_TEMPLATE_SIZE,
  PATRON_TEMPLATE,
  PATRON_TEMPLATE_SIZE,
  copiarCatalogoTemplate,
  type CatalogoTemplateClient,
} from './catalogo-template';
import {
  Categoria,
  CATEGORIA_BUCKET,
} from '../../domain/value-objects/categoria';
import { BUCKET_IDS } from './bucket-ids';

describe('CATEGORIA_TEMPLATE', () => {
  it('covers exactly the 8 Categoria enum values', () => {
    expect(CATEGORIA_TEMPLATE_SIZE).toBe(8);
    expect(CATEGORIA_TEMPLATE).toHaveLength(CATEGORIA_TEMPLATE_SIZE);
    const nombres = CATEGORIA_TEMPLATE.map((entry) => entry.nombre).sort();
    expect(nombres).toEqual([...Object.values(Categoria)].sort());
  });

  it('derives each bucketId from CATEGORIA_BUCKET + BUCKET_IDS — never a literal', () => {
    for (const entry of CATEGORIA_TEMPLATE) {
      expect(entry.bucketId).toBe(BUCKET_IDS[CATEGORIA_BUCKET[entry.nombre]]);
    }
  });
});

describe('PATRON_TEMPLATE', () => {
  it('every entry has a valid enum categoria', () => {
    const categoriasValidas = new Set<string>(Object.values(Categoria));
    for (const entry of PATRON_TEMPLATE) {
      expect(categoriasValidas.has(entry.categoria)).toBe(true);
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
