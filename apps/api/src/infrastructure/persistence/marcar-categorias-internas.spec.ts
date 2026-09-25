import {
  runMarcarCategoriasInternas,
  main,
  type MarcarInternasClient,
  type MarcarInternasTxClient,
} from '../../../prisma/marcar-categorias-internas';
import { Bucket } from '../../domain/value-objects/bucket';

/**
 * marcar-categorias-internas — unit tests (sin BD).
 *
 * `runMarcarCategoriasInternas` solo depende de un subconjunto estructural
 * de PrismaClient (MarcarInternasClient); este fake reproduce
 * findMany/updateMany en memoria (mismo patrón que backfill-categorias.spec.ts).
 */

const USER_ID = 'user-1';
const OTHER_USER_ID = 'user-2';

interface FakeCategoriaRow {
  id: string;
  userId: string;
  nombre: string;
  esInterna: boolean;
  // `Bucket | 'SinCategoria'` (not just `Bucket`): the real
  // `MarcarInternasClient.categoria.findMany` reads `bucket.nombre` as a
  // raw string off the DB, not a typed `Bucket` — a row can still carry the
  // legacy literal `'SinCategoria'` (issue #778 tramo 5b PR5 removed the
  // enum member, but the BucketPresupuesto row/data survive until PR 6).
  bucket: Bucket | 'SinCategoria';
}

interface UpdateManyCall {
  ids: string[];
  userId: string;
  data: { esInterna: true };
}

function makeFakeClient(seed: { categorias?: FakeCategoriaRow[] }) {
  // Copia propia por fila — updateMany muta esta copia, no el array del
  // test original.
  const categorias = (seed.categorias ?? []).map((c) => ({ ...c }));
  const updateManyCalls: UpdateManyCall[] = [];
  let transactionCalls = 0;
  let findManyCalls = 0;

  const tx: MarcarInternasTxClient = {
    categoria: {
      updateMany: async ({ where, data }) => {
        updateManyCalls.push({
          ids: where.id.in,
          userId: where.userId,
          data,
        });
        let count = 0;
        for (const fila of categorias) {
          if (where.id.in.includes(fila.id) && fila.userId === where.userId) {
            // Aplica EXACTAMENTE el valor que mandó el código real — no
            // hardcodea `true`, para que un bug que mande el dato equivocado
            // (o no lo mande) se vea reflejado en el estado final.
            fila.esInterna = data.esInterna;
            count++;
          }
        }
        return { count };
      },
    },
  };

  const client: MarcarInternasClient = {
    categoria: {
      findMany: async ({ where }) => {
        findManyCalls++;
        return categorias
          .filter((c) => c.userId === where.userId && c.nombre === where.nombre)
          .map((c) => ({
            id: c.id,
            nombre: c.nombre,
            esInterna: c.esInterna,
            bucket: { nombre: c.bucket },
          }));
      },
    },
    $transaction: async (fn) => {
      transactionCalls++;
      return fn(tx);
    },
  };

  return {
    client,
    updateManyCalls,
    getTransactionCalls: () => transactionCalls,
    getFindManyCalls: () => findManyCalls,
    getCategorias: () => categorias,
  };
}

/** Las tres `Desconocido` de un usuario, todas SIN marcar (estado pre-#778). */
function seedDesconocidoSinMarcar(userId: string): FakeCategoriaRow[] {
  return [Bucket.Necesidades, Bucket.Deseos, Bucket.Ahorro].map((bucket) => ({
    id: `desconocido-${userId}-${bucket}`,
    userId,
    nombre: 'Desconocido',
    esInterna: false,
    bucket,
  }));
}

describe('runMarcarCategoriasInternas — caso feliz: marca las tres Desconocido sin marcar', () => {
  it('las tres pasan de esInterna=false a esInterna=true', async () => {
    const seed = seedDesconocidoSinMarcar(USER_ID);
    const { client, getCategorias, updateManyCalls } = makeFakeClient({
      categorias: seed,
    });

    const summary = await runMarcarCategoriasInternas(client, {
      userId: USER_ID,
      dryRun: false,
    });

    expect(summary.aMarcar).toHaveLength(3);
    expect(summary.yaMarcadas).toEqual([]);
    expect(summary.faltantes).toEqual([]);

    for (const bucket of [Bucket.Necesidades, Bucket.Deseos, Bucket.Ahorro]) {
      const fila = getCategorias().find((c) => c.bucket === bucket)!;
      expect(fila.esInterna).toBe(true);
    }

    expect(updateManyCalls).toHaveLength(1);
    expect(updateManyCalls[0].userId).toBe(USER_ID);
    expect(new Set(updateManyCalls[0].ids)).toEqual(
      new Set(seed.map((c) => c.id)),
    );
  });
});

describe('runMarcarCategoriasInternas — ya marcada no se toca', () => {
  it('una Desconocido ya en esInterna=true se reporta como ya marcada, no como candidata', async () => {
    const seed = seedDesconocidoSinMarcar(USER_ID);
    const deseosYaMarcada = seed.find((c) => c.bucket === Bucket.Deseos)!;
    deseosYaMarcada.esInterna = true;

    const { client, getCategorias, updateManyCalls } = makeFakeClient({
      categorias: seed,
    });

    const summary = await runMarcarCategoriasInternas(client, {
      userId: USER_ID,
      dryRun: false,
    });

    expect(summary.yaMarcadas).toEqual([Bucket.Deseos]);
    expect(summary.aMarcar.map((c) => c.bucket).sort()).toEqual(
      [Bucket.Ahorro, Bucket.Necesidades].sort(),
    );

    // updateMany solo tocó las dos que faltaban — Deseos no aparece en los ids.
    expect(updateManyCalls[0].ids).not.toContain(deseosYaMarcada.id);
    const filaDeseos = getCategorias().find((c) => c.bucket === Bucket.Deseos)!;
    expect(filaDeseos.esInterna).toBe(true);
  });
});

describe('runMarcarCategoriasInternas — dos candidatas en el mismo bucket', () => {
  it('aborta sin escribir NADA, en ningún bucket, y lista las candidatas', async () => {
    const seed = seedDesconocidoSinMarcar(USER_ID);
    // Duplicado sintético en Ahorro — el fake no respeta el @@unique real
    // (ver docblock del script: la defensa es propia, no delegada al schema).
    const duplicada: FakeCategoriaRow = {
      id: 'desconocido-duplicada',
      userId: USER_ID,
      nombre: 'Desconocido',
      esInterna: false,
      bucket: Bucket.Ahorro,
    };
    const { client, getCategorias, updateManyCalls, getTransactionCalls } =
      makeFakeClient({ categorias: [...seed, duplicada] });

    await expect(
      runMarcarCategoriasInternas(client, { userId: USER_ID, dryRun: false }),
    ).rejects.toThrow(/Ahorro/);

    // Nada se escribió, ni siquiera Necesidades/Deseos que no eran ambiguos.
    expect(updateManyCalls).toHaveLength(0);
    expect(getTransactionCalls()).toBe(0);
    for (const fila of getCategorias()) {
      expect(fila.esInterna).toBe(false);
    }
  });

  it('el mensaje de error incluye los ids de ambas candidatas', async () => {
    const seed = seedDesconocidoSinMarcar(USER_ID);
    const duplicada: FakeCategoriaRow = {
      id: 'desconocido-duplicada-id',
      userId: USER_ID,
      nombre: 'Desconocido',
      esInterna: false,
      bucket: Bucket.Necesidades,
    };
    const original = seed.find((c) => c.bucket === Bucket.Necesidades)!;
    const { client } = makeFakeClient({ categorias: [...seed, duplicada] });

    await expect(
      runMarcarCategoriasInternas(client, { userId: USER_ID, dryRun: false }),
    ).rejects.toThrow(
      new RegExp(
        `${original.id}.*${duplicada.id}|${duplicada.id}.*${original.id}`,
      ),
    );
  });
});

describe('runMarcarCategoriasInternas — nunca toca otro nombre', () => {
  it('una categoría "Otros" en Necesidades no aparece como candidata ni se toca', async () => {
    const seed = seedDesconocidoSinMarcar(USER_ID).filter(
      (c) => c.bucket !== Bucket.Necesidades,
    );
    const otra: FakeCategoriaRow = {
      id: 'otra-categoria',
      userId: USER_ID,
      nombre: 'Otros',
      esInterna: false,
      bucket: Bucket.Necesidades,
    };
    const { client, getCategorias } = makeFakeClient({
      categorias: [...seed, otra],
    });

    const summary = await runMarcarCategoriasInternas(client, {
      userId: USER_ID,
      dryRun: false,
    });

    // Necesidades no tiene ninguna "Desconocido" — se reporta como faltante,
    // "Otros" nunca cuenta como candidata.
    expect(summary.faltantes).toEqual([Bucket.Necesidades]);
    expect(summary.aMarcar.some((c) => c.id === 'otra-categoria')).toBe(false);

    const filaOtra = getCategorias().find((c) => c.id === 'otra-categoria')!;
    expect(filaOtra.esInterna).toBe(false);
  });
});

describe('runMarcarCategoriasInternas — nunca toca Ingreso ni SinCategoria', () => {
  it('una "Desconocido" en Ingreso o SinCategoria no se marca ni se reporta como candidata', async () => {
    const seed = seedDesconocidoSinMarcar(USER_ID);
    const desconocidoIngreso: FakeCategoriaRow = {
      id: 'desconocido-ingreso',
      userId: USER_ID,
      nombre: 'Desconocido',
      esInterna: false,
      bucket: Bucket.Ingreso,
    };
    const desconocidoSinCategoria: FakeCategoriaRow = {
      id: 'desconocido-sincategoria',
      userId: USER_ID,
      nombre: 'Desconocido',
      esInterna: false,
      bucket: 'SinCategoria',
    };
    const { client, getCategorias, updateManyCalls } = makeFakeClient({
      categorias: [...seed, desconocidoIngreso, desconocidoSinCategoria],
    });

    const summary = await runMarcarCategoriasInternas(client, {
      userId: USER_ID,
      dryRun: false,
    });

    expect(summary.aMarcar).toHaveLength(3);
    expect(
      updateManyCalls[0].ids.includes(desconocidoIngreso.id) ||
        updateManyCalls[0].ids.includes(desconocidoSinCategoria.id),
    ).toBe(false);

    const filaIngreso = getCategorias().find(
      (c) => c.id === desconocidoIngreso.id,
    )!;
    const filaSinCategoria = getCategorias().find(
      (c) => c.id === desconocidoSinCategoria.id,
    )!;
    expect(filaIngreso.esInterna).toBe(false);
    expect(filaSinCategoria.esInterna).toBe(false);
  });
});

describe('runMarcarCategoriasInternas — falta una Desconocido en un bucket', () => {
  it('el bucket sin ninguna Desconocido se reporta como faltante, y no falla', async () => {
    const seed = seedDesconocidoSinMarcar(USER_ID).filter(
      (c) => c.bucket !== Bucket.Ahorro,
    );
    const { client } = makeFakeClient({ categorias: seed });

    const summary = await runMarcarCategoriasInternas(client, {
      userId: USER_ID,
      dryRun: false,
    });

    expect(summary.faltantes).toEqual([Bucket.Ahorro]);
    expect(summary.aMarcar.map((c) => c.bucket).sort()).toEqual(
      [Bucket.Deseos, Bucket.Necesidades].sort(),
    );
  });
});

describe('runMarcarCategoriasInternas — --dry-run no escribe', () => {
  it('calcula el resumen completo pero no abre transacción ni escribe', async () => {
    const seed = seedDesconocidoSinMarcar(USER_ID);
    const { client, getCategorias, updateManyCalls, getTransactionCalls } =
      makeFakeClient({ categorias: seed });

    const summary = await runMarcarCategoriasInternas(client, {
      userId: USER_ID,
      dryRun: true,
    });

    expect(summary.aMarcar).toHaveLength(3);
    expect(updateManyCalls).toHaveLength(0);
    expect(getTransactionCalls()).toBe(0);

    for (const fila of getCategorias()) {
      expect(fila.esInterna).toBe(false);
    }
  });
});

describe('runMarcarCategoriasInternas — aislamiento multi-tenant', () => {
  it('filas de otro usuario no se tocan', async () => {
    const seedUser = seedDesconocidoSinMarcar(USER_ID);
    const seedOtro = seedDesconocidoSinMarcar(OTHER_USER_ID);

    const { client, getCategorias } = makeFakeClient({
      categorias: [...seedUser, ...seedOtro],
    });

    const summary = await runMarcarCategoriasInternas(client, {
      userId: USER_ID,
      dryRun: false,
    });

    expect(summary.aMarcar).toHaveLength(3);

    for (const fila of getCategorias().filter(
      (c) => c.userId === OTHER_USER_ID,
    )) {
      expect(fila.esInterna).toBe(false);
    }
  });
});

describe('marcar-categorias-internas — main() gates (unit, sin BD)', () => {
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
