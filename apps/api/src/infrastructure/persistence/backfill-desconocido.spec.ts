import {
  runBackfillDesconocido,
  main,
  type BackfillDesconocidoClient,
  type BackfillDesconocidoTxClient,
} from '../../../prisma/backfill-desconocido';
import { BUCKET_IDS } from './bucket-ids';
import { Bucket } from '../../domain/value-objects/bucket';

/**
 * backfill-desconocido — unit tests (sin BD).
 *
 * `runBackfillDesconocido` solo depende de un subconjunto estructural de
 * PrismaClient (BackfillDesconocidoClient); este fake reproduce
 * findMany/count/updateMany en memoria (mismo patrón que
 * backfill-catalogo-faltante.spec.ts).
 */

const USER_ID = 'user-1';
const OTHER_USER_ID = 'user-2';

interface FakeCategoriaRow {
  id: string;
  userId: string;
  nombre: string;
  esInterna: boolean;
  bucket: Bucket;
}

interface FakeTransaccionRow {
  id: string;
  userId: string;
  fecha: Date;
  cargo: bigint;
  abono: bigint;
  bucketId: string | null;
  categoriaId: string | null;
}

interface UpdateManyCall {
  ids: string[];
  data: { categoriaId: string; bucketId?: string };
}

/** Las tres `Desconocido` internas de un usuario — precondición del script. */
function seedDesconocido(userId: string): FakeCategoriaRow[] {
  return [Bucket.Necesidades, Bucket.Deseos, Bucket.Ahorro].map((bucket) => ({
    id: `desconocido-${userId}-${bucket}`,
    userId,
    nombre: 'Desconocido',
    esInterna: true,
    bucket,
  }));
}

function makeFakeClient(seed: {
  categorias?: FakeCategoriaRow[];
  transacciones?: FakeTransaccionRow[];
}) {
  const categorias = [...(seed.categorias ?? [])];
  // Copia profunda ligera: cada fila es un objeto propio, para que
  // updateMany pueda mutarla sin pisar el array del test original.
  const transacciones = (seed.transacciones ?? []).map((t) => ({ ...t }));
  const updateManyCalls: UpdateManyCall[] = [];
  let transactionCalls = 0;
  let categoriaFindManyCalls = 0;
  let transaccionFindManyCalls = 0;

  const tx: BackfillDesconocidoTxClient = {
    transaccion: {
      updateMany: async ({ where, data }) => {
        updateManyCalls.push({ ids: where.id.in, data });
        let count = 0;
        for (const fila of transacciones) {
          if (where.id.in.includes(fila.id)) {
            if (data.bucketId !== undefined) fila.bucketId = data.bucketId;
            fila.categoriaId = data.categoriaId;
            count++;
          }
        }
        return { count };
      },
    },
  };

  const client: BackfillDesconocidoClient = {
    categoria: {
      findMany: async ({ where }) => {
        categoriaFindManyCalls++;
        return categorias
          .filter((c) => c.userId === where.userId)
          .map((c) => ({
            id: c.id,
            nombre: c.nombre,
            esInterna: c.esInterna,
            bucket: { nombre: c.bucket },
          }));
      },
    },
    transaccion: {
      findMany: async ({ where }) => {
        transaccionFindManyCalls++;
        return transacciones
          .filter((t) => t.userId === where.account.userId)
          .filter((t) => {
            if (typeof where.bucketId === 'string') {
              return t.bucketId === where.bucketId;
            }
            return where.bucketId.in.includes(t.bucketId as string);
          })
          .filter((t) =>
            where.categoriaId === null ? t.categoriaId === null : true,
          )
          .map((t) => ({
            id: t.id,
            fecha: t.fecha,
            cargo: t.cargo,
            abono: t.abono,
            bucketId: t.bucketId,
          }));
      },
      count: async ({ where }) =>
        transacciones.filter(
          (t) => t.userId === where.account.userId && t.bucketId === null,
        ).length,
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
    getCategoriaFindManyCalls: () => categoriaFindManyCalls,
    getTransaccionFindManyCalls: () => transaccionFindManyCalls,
    getTransacciones: () => transacciones,
  };
}

function fecha(iso: string): Date {
  return new Date(iso);
}

describe('runBackfillDesconocido — migración (A) SinCategoria → Deseos/Desconocido (unit, sin BD)', () => {
  it('una fila en SinCategoria termina en Deseos con la Desconocido de Deseos', async () => {
    const desconocido = seedDesconocido(USER_ID);
    const desconocidoDeseos = desconocido.find(
      (c) => c.bucket === Bucket.Deseos,
    )!;

    const { client, getTransacciones, updateManyCalls } = makeFakeClient({
      categorias: desconocido,
      transacciones: [
        {
          id: 'tx-1',
          userId: USER_ID,
          fecha: fecha('2026-06-15'),
          cargo: 5000n,
          abono: 0n,
          bucketId: BUCKET_IDS[Bucket.SinCategoria],
          categoriaId: null,
        },
      ],
    });

    const summary = await runBackfillDesconocido(client, {
      userId: USER_ID,
      dryRun: false,
    });

    expect(summary.migracionSinCategoria.filasMigradas).toBe(1);

    const filaFinal = getTransacciones().find((t) => t.id === 'tx-1')!;
    expect(filaFinal.bucketId).toBe(BUCKET_IDS[Bucket.Deseos]);
    expect(filaFinal.categoriaId).toBe(desconocidoDeseos.id);

    expect(updateManyCalls).toHaveLength(1);
    expect(updateManyCalls[0].data).toEqual({
      bucketId: BUCKET_IDS[Bucket.Deseos],
      categoriaId: desconocidoDeseos.id,
    });
  });
});

describe('runBackfillDesconocido — migración (B) categoriaId nulo en bucket ya asignado (unit, sin BD)', () => {
  it('una fila en Necesidades con categoriaId null termina con la Desconocido DE Necesidades, y su bucketId NO cambia', async () => {
    const desconocido = seedDesconocido(USER_ID);
    const desconocidoNecesidades = desconocido.find(
      (c) => c.bucket === Bucket.Necesidades,
    )!;

    const { client, getTransacciones } = makeFakeClient({
      categorias: desconocido,
      transacciones: [
        {
          id: 'tx-2',
          userId: USER_ID,
          fecha: fecha('2026-06-10'),
          cargo: 12000n,
          abono: 0n,
          bucketId: BUCKET_IDS[Bucket.Necesidades],
          categoriaId: null,
        },
      ],
    });

    const summary = await runBackfillDesconocido(client, {
      userId: USER_ID,
      dryRun: false,
    });

    expect(summary.migracionCategoriaNula.filasMigradas).toBe(1);
    // Esta migración NO mueve plata: 0 impacto por período.
    expect(summary.migracionSinCategoria.impactoPorPeriodo).toEqual([]);

    const filaFinal = getTransacciones().find((t) => t.id === 'tx-2')!;
    // bucketId INTACTO — sigue siendo Necesidades, nunca Deseos.
    expect(filaFinal.bucketId).toBe(BUCKET_IDS[Bucket.Necesidades]);
    expect(filaFinal.categoriaId).toBe(desconocidoNecesidades.id);
  });
});

describe('runBackfillDesconocido — bucketId IS NULL nunca se toca (unit, sin BD)', () => {
  it('una fila con bucketId null NO se migra y aparece en el resumen como pendiente', async () => {
    const desconocido = seedDesconocido(USER_ID);

    const { client, getTransacciones, updateManyCalls } = makeFakeClient({
      categorias: desconocido,
      transacciones: [
        {
          id: 'tx-pendiente',
          userId: USER_ID,
          fecha: fecha('2026-06-01'),
          cargo: 7000n,
          abono: 0n,
          bucketId: null,
          categoriaId: null,
        },
      ],
    });

    const summary = await runBackfillDesconocido(client, {
      userId: USER_ID,
      dryRun: false,
    });

    // Ni (A) ni (B) la alcanzan.
    expect(summary.migracionSinCategoria.filasMigradas).toBe(0);
    expect(summary.migracionCategoriaNula.filasMigradas).toBe(0);
    // Aparece contada aparte, como pendiente.
    expect(summary.pendientesBucketNulo).toBe(1);

    // Nunca se escribió nada sobre ella.
    expect(updateManyCalls).toHaveLength(0);
    const filaFinal = getTransacciones().find((t) => t.id === 'tx-pendiente')!;
    expect(filaFinal.bucketId).toBeNull();
    expect(filaFinal.categoriaId).toBeNull();
  });
});

describe('runBackfillDesconocido — Ingreso no se toca (unit, sin BD)', () => {
  it('una fila en Ingreso con categoriaId null queda exactamente igual', async () => {
    const desconocido = seedDesconocido(USER_ID);

    const { client, getTransacciones, updateManyCalls } = makeFakeClient({
      categorias: desconocido,
      transacciones: [
        {
          id: 'tx-ingreso',
          userId: USER_ID,
          fecha: fecha('2026-06-05'),
          cargo: 0n,
          abono: 300000n,
          bucketId: BUCKET_IDS[Bucket.Ingreso],
          categoriaId: null,
        },
      ],
    });

    const summary = await runBackfillDesconocido(client, {
      userId: USER_ID,
      dryRun: false,
    });

    expect(summary.migracionSinCategoria.filasMigradas).toBe(0);
    expect(summary.migracionCategoriaNula.filasMigradas).toBe(0);
    expect(summary.pendientesBucketNulo).toBe(0);

    expect(updateManyCalls).toHaveLength(0);
    const filaFinal = getTransacciones().find((t) => t.id === 'tx-ingreso')!;
    expect(filaFinal.bucketId).toBe(BUCKET_IDS[Bucket.Ingreso]);
    expect(filaFinal.categoriaId).toBeNull();
  });
});

describe('runBackfillDesconocido — precondición: falta una Desconocido (unit, sin BD)', () => {
  it('aborta sin escribir nada si falta la Desconocido de un bucket', async () => {
    // Seed: solo Necesidades y Ahorro tienen Desconocido — falta Deseos.
    const desconocidoIncompleto = seedDesconocido(USER_ID).filter(
      (c) => c.bucket !== Bucket.Deseos,
    );

    const { client, updateManyCalls, getTransactionCalls } = makeFakeClient({
      categorias: desconocidoIncompleto,
      transacciones: [
        {
          id: 'tx-1',
          userId: USER_ID,
          fecha: fecha('2026-06-15'),
          cargo: 5000n,
          abono: 0n,
          bucketId: BUCKET_IDS[Bucket.SinCategoria],
          categoriaId: null,
        },
      ],
    });

    await expect(
      runBackfillDesconocido(client, { userId: USER_ID, dryRun: false }),
    ).rejects.toThrow(/Deseos/);

    expect(updateManyCalls).toHaveLength(0);
    expect(getTransactionCalls()).toBe(0);
  });

  it('también aborta en --dry-run (la precondición no depende del modo)', async () => {
    const desconocidoIncompleto = seedDesconocido(USER_ID).filter(
      (c) => c.bucket !== Bucket.Ahorro,
    );

    const { client, getTransactionCalls } = makeFakeClient({
      categorias: desconocidoIncompleto,
      transacciones: [],
    });

    await expect(
      runBackfillDesconocido(client, { userId: USER_ID, dryRun: true }),
    ).rejects.toThrow(/Ahorro/);
    expect(getTransactionCalls()).toBe(0);
  });

  it('bucket sin ninguna fila Desconocido → el mensaje manda a backfill-catalogo-faltante.ts', async () => {
    // Deseos no tiene NINGUNA fila (ni marcada ni sin marcar) — "no existe".
    const catalogo = seedDesconocido(USER_ID).filter(
      (c) => c.bucket !== Bucket.Deseos,
    );

    const { client } = makeFakeClient({
      categorias: catalogo,
      transacciones: [],
    });

    await expect(
      runBackfillDesconocido(client, { userId: USER_ID, dryRun: false }),
    ).rejects.toThrow(
      /Deseos \(no existe — corré `prisma\/backfill-catalogo-faltante\.ts --user user-1`\)/,
    );
  });

  it('bucket con la fila Desconocido SIN marcar (esInterna=false) → el mensaje manda a marcar-categorias-internas.ts', async () => {
    // Deseos SÍ tiene la fila, pero esInterna=false (catálogo pre-#778,
    // ver e8c20b78) — "existe pero sin marcar", NO "no existe".
    const catalogo = seedDesconocido(USER_ID).map((c) =>
      c.bucket === Bucket.Deseos ? { ...c, esInterna: false } : c,
    );

    const { client } = makeFakeClient({
      categorias: catalogo,
      transacciones: [],
    });

    await expect(
      runBackfillDesconocido(client, { userId: USER_ID, dryRun: false }),
    ).rejects.toThrow(
      /Deseos \(existe pero sin marcar — corré `prisma\/marcar-categorias-internas\.ts --user user-1`\)/,
    );
  });

  it('dos buckets faltantes por causas distintas → el mensaje distingue cada uno por separado', async () => {
    // Necesidades: no existe ninguna fila. Deseos: existe pero sin marcar.
    const catalogo = seedDesconocido(USER_ID)
      .filter((c) => c.bucket !== Bucket.Necesidades)
      .map((c) =>
        c.bucket === Bucket.Deseos ? { ...c, esInterna: false } : c,
      );

    const { client } = makeFakeClient({
      categorias: catalogo,
      transacciones: [],
    });

    await expect(
      runBackfillDesconocido(client, { userId: USER_ID, dryRun: false }),
    ).rejects.toThrow(
      /Necesidades \(no existe.*\).*Deseos \(existe pero sin marcar.*\)/,
    );
  });
});

describe('runBackfillDesconocido — --dry-run (unit, sin BD)', () => {
  it('no escribe nada y aun así reporta el impacto', async () => {
    const desconocido = seedDesconocido(USER_ID);

    const { client, getTransacciones, updateManyCalls, getTransactionCalls } =
      makeFakeClient({
        categorias: desconocido,
        transacciones: [
          {
            id: 'tx-1',
            userId: USER_ID,
            fecha: fecha('2026-06-15'),
            cargo: 5000n,
            abono: 0n,
            bucketId: BUCKET_IDS[Bucket.SinCategoria],
            categoriaId: null,
          },
          {
            id: 'tx-2',
            userId: USER_ID,
            fecha: fecha('2026-06-10'),
            cargo: 12000n,
            abono: 0n,
            bucketId: BUCKET_IDS[Bucket.Necesidades],
            categoriaId: null,
          },
        ],
      });

    const summary = await runBackfillDesconocido(client, {
      userId: USER_ID,
      dryRun: true,
    });

    expect(summary.migracionSinCategoria.filasMigradas).toBe(1);
    expect(summary.migracionCategoriaNula.filasMigradas).toBe(1);

    expect(updateManyCalls).toHaveLength(0);
    expect(getTransactionCalls()).toBe(0);

    // Estado real intacto — nada mutó.
    const tx1 = getTransacciones().find((t) => t.id === 'tx-1')!;
    expect(tx1.bucketId).toBe(BUCKET_IDS[Bucket.SinCategoria]);
    expect(tx1.categoriaId).toBeNull();
    const tx2 = getTransacciones().find((t) => t.id === 'tx-2')!;
    expect(tx2.bucketId).toBe(BUCKET_IDS[Bucket.Necesidades]);
    expect(tx2.categoriaId).toBeNull();
  });
});

describe('runBackfillDesconocido — aislamiento multi-tenant (unit, sin BD)', () => {
  it('filas de otro usuario no se tocan', async () => {
    const desconocidoUser = seedDesconocido(USER_ID);
    const desconocidoOtro = seedDesconocido(OTHER_USER_ID);

    const { client, getTransacciones } = makeFakeClient({
      categorias: [...desconocidoUser, ...desconocidoOtro],
      transacciones: [
        {
          id: 'tx-mio',
          userId: USER_ID,
          fecha: fecha('2026-06-15'),
          cargo: 5000n,
          abono: 0n,
          bucketId: BUCKET_IDS[Bucket.SinCategoria],
          categoriaId: null,
        },
        {
          id: 'tx-ajena',
          userId: OTHER_USER_ID,
          fecha: fecha('2026-06-15'),
          cargo: 9999n,
          abono: 0n,
          bucketId: BUCKET_IDS[Bucket.SinCategoria],
          categoriaId: null,
        },
      ],
    });

    const summary = await runBackfillDesconocido(client, {
      userId: USER_ID,
      dryRun: false,
    });

    expect(summary.migracionSinCategoria.filasMigradas).toBe(1);

    const filaAjena = getTransacciones().find((t) => t.id === 'tx-ajena')!;
    expect(filaAjena.bucketId).toBe(BUCKET_IDS[Bucket.SinCategoria]);
    expect(filaAjena.categoriaId).toBeNull();
  });
});

describe('runBackfillDesconocido — resumen por período (unit, sin BD)', () => {
  it('agrupa por período (YYYY-MM) y suma en BigInt', async () => {
    const desconocido = seedDesconocido(USER_ID);

    const { client } = makeFakeClient({
      categorias: desconocido,
      transacciones: [
        {
          id: 'tx-jun-1',
          userId: USER_ID,
          fecha: fecha('2026-06-05'),
          cargo: 5000n,
          abono: 0n,
          bucketId: BUCKET_IDS[Bucket.SinCategoria],
          categoriaId: null,
        },
        {
          id: 'tx-jun-2',
          userId: USER_ID,
          fecha: fecha('2026-06-20'),
          cargo: 3000n,
          abono: 0n,
          bucketId: BUCKET_IDS[Bucket.SinCategoria],
          categoriaId: null,
        },
        {
          id: 'tx-jul-1',
          userId: USER_ID,
          fecha: fecha('2026-07-01'),
          cargo: 7000n,
          abono: 0n,
          bucketId: BUCKET_IDS[Bucket.SinCategoria],
          categoriaId: null,
        },
      ],
    });

    const summary = await runBackfillDesconocido(client, {
      userId: USER_ID,
      dryRun: true,
    });

    expect(summary.migracionSinCategoria.impactoPorPeriodo).toEqual([
      { periodo: '2026-06', montoMovido: 8000n },
      { periodo: '2026-07', montoMovido: 7000n },
    ]);
    // Tipo BigInt real, no Number — cero pérdida de precisión.
    expect(
      typeof summary.migracionSinCategoria.impactoPorPeriodo[0].montoMovido,
    ).toBe('bigint');
  });
});

describe('backfill-desconocido — main() gates (unit, sin BD)', () => {
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
