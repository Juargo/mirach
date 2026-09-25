/**
 * Integration tests for PrismaDetalleBucketRepository (US-017).
 *
 * Requires a real DB connection. Run via `pnpm api test:integration`
 * (sets ALLOW_DESTRUCTIVE_DB=1). Seeds and cleans up its own rows.
 * Mirrors PrismaResumenMesRepository's colocated-spec convention: when
 * ALLOW_DESTRUCTIVE_DB is unset, every assertion body short-circuits so the
 * file still typechecks and passes as a no-op inside `pnpm api test`.
 *
 * Covered scenarios (guards the design's flagged HIGH-risk correctness item):
 *   - SC-01: valid bucket returns only rows matching that bucket, in the period window
 *   - SC-03 (issue #778 tramo 5b PR5): `Bucket.SinCategoria` was removed from
 *     the domain — a null-bucketId row AND a row still holding the legacy
 *     physical id `bucket-sincategoria` BOTH fold to Deseos and BOTH appear
 *     in the Deseos drill-down (no double count, no loss); neither appears
 *     under any OTHER bucket's drill-down
 *   - CA-03: half-open [desde, hasta) window (desde inclusive, hasta exclusive)
 *   - User isolation (RNF-SEC-006): user B's data must NOT bleed into user A
 *   - Ordering: fecha asc, id asc tiebreak
 *   - Grand-total invariant: summing cargo across all 4 buckets' detail
 *     queries reconciles with the total cargo actually seeded, regardless of
 *     how many rows have a null or legacy-SinCategoria bucketId (no double
 *     count, no loss)
 */
import { PrismaClient } from '@prisma/client';
import { PrismaDetalleBucketRepository } from './prisma-detalle-bucket.repository';
import { PeriodoMes } from '../../domain/value-objects/periodo-mes';
import { Bucket } from '../../domain/value-objects/bucket';
import { BUCKET_IDS, ID_BUCKET_SINCATEGORIA_LEGACY } from './bucket-ids';
import { ICryptoService } from '../../application/ports/crypto-service.port';
import { NoOpCryptoService } from './no-op-crypto.service';
import { appLogger } from '../logging/app-logger';

const ALLOW = process.env.ALLOW_DESTRUCTIVE_DB === '1';

function makeCrypto(decryptFn?: (v: string) => string): ICryptoService {
  return {
    encrypt: (v: string) => v,
    decrypt: decryptFn ?? ((v: string) => v),
  };
}

/**
 * Unit tests (mocked PrismaClient) for the CATAPI-05 categoria fold —
 * mirrors the mocked pattern in prisma-movimientos-mes.repository.spec.ts.
 * The rest of this file is gated integration coverage for the pre-existing
 * bucket-scoped read path (see the file-level docstring below); this block
 * covers only the new `categoria` field's fold logic, which does not need a
 * real DB.
 */
describe('PrismaDetalleBucketRepository — categoria fold (unit)', () => {
  const periodo = PeriodoMes.crear('2026-07').getValue();

  function makeRow(overrides: {
    id: string;
    categoria: { id: string; nombre: string; icono: string | null } | null;
  }) {
    return {
      id: overrides.id,
      fecha: new Date('2026-07-10T00:00:00.000Z'),
      descripcion: 'Test tx',
      cargo: 1000n,
      abono: 0n,
      categoria: overrides.categoria,
      account: {
        banco: 'BCI',
        tipoCuenta: 'Cuenta Corriente',
        numeroCuenta: 'acc-1',
      },
    };
  }

  it('ordena por monto DESCENDENTE en SQL, con fecha e id como desempate determinista', async () => {
    // El orden de las transacciones del detalle se decide ACÁ, en el
    // `orderBy` de la query: `agruparDetallePorCategoria` preserva el orden
    // en que llegan las filas y nunca re-sortea. Este assert es el único
    // lugar donde ese contrato queda fijado.
    //
    // Antes de 2026-09-17 era `[{ fecha: 'asc' }, { id: 'asc' }]` y NINGÚN
    // test lo cubría: se pudo cambiar el orden de toda la pantalla sin poner
    // un solo test en rojo.
    //
    // `cargo` no está cifrado (sí lo está `descripcion`), y por eso puede
    // ordenarse en la base en vez de en memoria.
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { transaccion: { findMany } } as unknown as PrismaClient;
    const repo = new PrismaDetalleBucketRepository(prisma, makeCrypto());

    await repo.findByPeriodoYBucket('user-1', periodo, Bucket.Necesidades);

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0][0].orderBy).toEqual([
      { cargo: 'desc' },
      { fecha: 'asc' },
      { id: 'asc' },
    ]);
  });

  it('CAT037-06: classified categoria (per-user cuid + nombre) folds to { id, nombre }', async () => {
    const findMany = vi.fn().mockResolvedValue([
      makeRow({
        id: 'tx-super',
        categoria: {
          id: 'cly-per-user-supermercado-cuid',
          nombre: 'Supermercado',
          icono: 'shopping-cart',
        },
      }),
    ]);
    const prisma = { transaccion: { findMany } } as unknown as PrismaClient;
    const repo = new PrismaDetalleBucketRepository(prisma, makeCrypto());

    const rows = await repo.findByPeriodoYBucket(
      'user-1',
      periodo,
      Bucket.Necesidades,
    );

    expect(rows[0].categoria).toEqual({
      id: 'cly-per-user-supermercado-cuid',
      nombre: 'Supermercado',
      icono: 'shopping-cart',
    });
  });

  it('categoria-iconografia CATICO-01/MBD-02: la fila categoria incluye el icono seleccionado', async () => {
    const findMany = vi.fn().mockResolvedValue([
      makeRow({
        id: 'tx-transporte',
        categoria: {
          id: 'cly-transporte-cuid',
          nombre: 'Transporte',
          icono: 'bus',
        },
      }),
    ]);
    const prisma = { transaccion: { findMany } } as unknown as PrismaClient;
    const repo = new PrismaDetalleBucketRepository(prisma, makeCrypto());

    const rows = await repo.findByPeriodoYBucket(
      'user-1',
      periodo,
      Bucket.Necesidades,
    );

    expect(rows[0].categoria?.icono).toBe('bus');
  });

  it('categoria-iconografia CATICO-01/D-04: una categoría sin icono propio mapea icono null (no undefined)', async () => {
    const findMany = vi.fn().mockResolvedValue([
      makeRow({
        id: 'tx-mascotas-sin-icono',
        categoria: { id: 'cly-mascotas-cuid', nombre: 'Mascotas', icono: null },
      }),
    ]);
    const prisma = { transaccion: { findMany } } as unknown as PrismaClient;
    const repo = new PrismaDetalleBucketRepository(prisma, makeCrypto());

    const rows = await repo.findByPeriodoYBucket(
      'user-1',
      periodo,
      Bucket.Necesidades,
    );

    expect(rows[0].categoria?.icono).toBeNull();
  });

  it('CAT037-06: null categoria (Ingreso row) folds to null', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([makeRow({ id: 'tx-null', categoria: null })]);
    const prisma = { transaccion: { findMany } } as unknown as PrismaClient;
    const repo = new PrismaDetalleBucketRepository(prisma, makeCrypto());

    const rows = await repo.findByPeriodoYBucket(
      'user-1',
      periodo,
      Bucket.Deseos,
    );

    expect(rows[0].categoria).toBeNull();
  });

  it('CAT037-06/D-01: an arbitrary owned category name passes through verbatim (no enum gate)', async () => {
    const findMany = vi.fn().mockResolvedValue([
      makeRow({
        id: 'tx-mascotas',
        categoria: { id: 'cly-some-cuid', nombre: 'Mascotas', icono: null },
      }),
    ]);
    const prisma = { transaccion: { findMany } } as unknown as PrismaClient;
    const repo = new PrismaDetalleBucketRepository(prisma, makeCrypto());

    const rows = await repo.findByPeriodoYBucket(
      'user-1',
      periodo,
      Bucket.Necesidades,
    );

    expect(rows[0].categoria).toEqual({
      id: 'cly-some-cuid',
      nombre: 'Mascotas',
      icono: null,
    });
  });

  it('CAT037-06/categoria-iconografia: select uses the nested categoria relation with icono, not a raw categoriaId scalar', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { transaccion: { findMany } } as unknown as PrismaClient;
    const repo = new PrismaDetalleBucketRepository(prisma, makeCrypto());

    await repo.findByPeriodoYBucket('user-1', periodo, Bucket.Necesidades);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          categoria: { select: { id: true, nombre: true, icono: true } },
        }),
      }),
    );
  });

  it('ADR-013: descripcion pasa por crypto.decrypt() antes de devolverse — el drill-down NUNCA expone ciphertext', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: 'tx-1',
        fecha: new Date('2026-07-10T00:00:00.000Z'),
        descripcion: 'cifrado-xyz',
        cargo: 1000n,
        abono: 0n,
        categoria: null,
        account: {
          banco: 'BCI',
          tipoCuenta: 'Cuenta Corriente',
          numeroCuenta: 'acc-1',
        },
      },
    ]);
    const prisma = { transaccion: { findMany } } as unknown as PrismaClient;
    const repo = new PrismaDetalleBucketRepository(
      prisma,
      makeCrypto((v) => `plano:${v}`),
    );

    const rows = await repo.findByPeriodoYBucket(
      'user-1',
      periodo,
      Bucket.Necesidades,
    );

    expect(rows[0].descripcion).toBe('plano:cifrado-xyz');
  });

  it('US-035: numeroCuenta pasa por crypto.decrypt() antes de devolverse — el drill-down NUNCA expone el ciphertext de numeroCuenta', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: 'tx-1',
        fecha: new Date('2026-07-10T00:00:00.000Z'),
        descripcion: 'Test tx',
        cargo: 1000n,
        abono: 0n,
        categoria: null,
        account: {
          banco: 'BCI',
          tipoCuenta: 'Cuenta Corriente',
          numeroCuenta: 'cifrado-numero-xyz',
        },
      },
    ]);
    const prisma = { transaccion: { findMany } } as unknown as PrismaClient;
    const repo = new PrismaDetalleBucketRepository(
      prisma,
      makeCrypto((v) => `plano:${v}`),
    );

    const rows = await repo.findByPeriodoYBucket(
      'user-1',
      periodo,
      Bucket.Necesidades,
    );

    expect(rows[0].numeroCuenta).toBe('plano:cifrado-numero-xyz');
  });
});

/**
 * Unit tests (mocked PrismaClient) for the #778 tramo 5b Desconocido
 * display-fold — mirrors the pattern proven in
 * prisma-movimientos-mes.repository.spec.ts. Only exercised when querying
 * `Bucket.Deseos`: a `bucketId IS NULL` row is the only source of orphans
 * `construirFiltroBucket` can surface for this bucket.
 */
describe('PrismaDetalleBucketRepository — Desconocido display-fold (unit, #778 tramo 5b)', () => {
  const periodo = PeriodoMes.crear('2026-07').getValue();

  function makeRawRow(overrides: {
    id: string;
    bucketId: string | null;
    categoria: { id: string; nombre: string; icono: string | null } | null;
  }) {
    return {
      id: overrides.id,
      fecha: new Date('2026-07-10T00:00:00.000Z'),
      descripcion: 'Test tx',
      cargo: 1000n,
      abono: 0n,
      bucketId: overrides.bucketId,
      categoria: overrides.categoria,
      account: {
        banco: 'BCI',
        tipoCuenta: 'Cuenta Corriente',
        numeroCuenta: 'acc-1',
      },
    };
  }

  it('bucketId null AND categoria null → categoria becomes the fetched Desconocido de Deseos (icono null)', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([
        makeRawRow({ id: 'tx-huerfana', bucketId: null, categoria: null }),
      ]);
    const findFirst = vi.fn().mockResolvedValue({
      id: 'cat-desconocido-deseos',
      nombre: 'Desconocido',
    });
    const prisma = {
      transaccion: { findMany },
      categoria: { findFirst },
    } as unknown as PrismaClient;
    const repo = new PrismaDetalleBucketRepository(prisma, makeCrypto());

    const rows = await repo.findByPeriodoYBucket(
      'user-1',
      periodo,
      Bucket.Deseos,
    );

    expect(rows[0].categoria).toEqual({
      id: 'cat-desconocido-deseos',
      nombre: 'Desconocido',
      icono: null,
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-1' }),
      }),
    );
  });

  it('catalog incomplete (no Desconocido de Deseos) → categoria stays null, does not throw', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([
        makeRawRow({ id: 'tx-huerfana', bucketId: null, categoria: null }),
      ]);
    const prisma = {
      transaccion: { findMany },
      categoria: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaClient;
    const repo = new PrismaDetalleBucketRepository(prisma, makeCrypto());

    const rows = await repo.findByPeriodoYBucket(
      'user-1',
      periodo,
      Bucket.Deseos,
    );

    expect(rows[0].categoria).toBeNull();
  });

  it('a row that already carries a real categoria keeps it — the fold NEVER overwrites an existing categoria', async () => {
    const findMany = vi.fn().mockResolvedValue([
      makeRawRow({
        id: 'tx-ya-categorizada',
        bucketId: null,
        categoria: {
          id: 'cat-real',
          nombre: 'Supermercado',
          icono: 'shopping-cart',
        },
      }),
    ]);
    const findFirst = vi.fn();
    const prisma = {
      transaccion: { findMany },
      categoria: { findFirst },
    } as unknown as PrismaClient;
    const repo = new PrismaDetalleBucketRepository(prisma, makeCrypto());

    const rows = await repo.findByPeriodoYBucket(
      'user-1',
      periodo,
      Bucket.Deseos,
    );

    expect(rows[0].categoria).toEqual({
      id: 'cat-real',
      nombre: 'Supermercado',
      icono: 'shopping-cart',
    });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('a normal (non-orphan) Deseos row is unaffected by the fold', async () => {
    const findMany = vi.fn().mockResolvedValue([
      makeRawRow({
        id: 'tx-normal',
        bucketId: 'bucket-deseos',
        categoria: { id: 'cat-paseos', nombre: 'Paseos', icono: null },
      }),
    ]);
    const findFirst = vi.fn();
    const prisma = {
      transaccion: { findMany },
      categoria: { findFirst },
    } as unknown as PrismaClient;
    const repo = new PrismaDetalleBucketRepository(prisma, makeCrypto());

    const rows = await repo.findByPeriodoYBucket(
      'user-1',
      periodo,
      Bucket.Deseos,
    );

    expect(rows[0].categoria).toEqual({
      id: 'cat-paseos',
      nombre: 'Paseos',
      icono: null,
    });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('no orphan rows → the Desconocido lookup never runs (no N+1, no unconditional query)', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const findFirst = vi.fn();
    const prisma = {
      transaccion: { findMany },
      categoria: { findFirst },
    } as unknown as PrismaClient;
    const repo = new PrismaDetalleBucketRepository(prisma, makeCrypto());

    await repo.findByPeriodoYBucket('user-1', periodo, Bucket.Ahorro);

    expect(findFirst).not.toHaveBeenCalled();
  });

  it('several orphan rows in the same page trigger the Desconocido lookup exactly ONCE (no N+1)', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([
        makeRawRow({ id: 'tx-1', bucketId: null, categoria: null }),
        makeRawRow({ id: 'tx-2', bucketId: null, categoria: null }),
        makeRawRow({ id: 'tx-3', bucketId: null, categoria: null }),
      ]);
    const findFirst = vi.fn().mockResolvedValue({
      id: 'cat-desconocido-deseos',
      nombre: 'Desconocido',
    });
    const prisma = {
      transaccion: { findMany },
      categoria: { findFirst },
    } as unknown as PrismaClient;
    const repo = new PrismaDetalleBucketRepository(prisma, makeCrypto());

    await repo.findByPeriodoYBucket('user-1', periodo, Bucket.Deseos);

    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it('logs a WARN with userId + bucket + count only (never montos/descripcion, ADR-013) when orphan rows are found', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([
        makeRawRow({ id: 'tx-1', bucketId: null, categoria: null }),
        makeRawRow({ id: 'tx-2', bucketId: null, categoria: null }),
      ]);
    const prisma = {
      transaccion: { findMany },
      categoria: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaClient;
    const repo = new PrismaDetalleBucketRepository(prisma, makeCrypto());
    const warnSpy = vi.spyOn(appLogger, 'warn').mockImplementation(() => {});

    await repo.findByPeriodoYBucket('user-orphan', periodo, Bucket.Deseos);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [, context] = warnSpy.mock.calls[0];
    expect(context).toEqual(
      expect.objectContaining({
        userId: 'user-orphan',
        bucket: Bucket.Deseos,
        filasSinBucket: 2,
      }),
    );
    const serialized = JSON.stringify(warnSpy.mock.calls[0]);
    expect(serialized).not.toContain('Test tx');
    expect(serialized).not.toContain('1000');
    warnSpy.mockRestore();
  });
});

const RUN_ID = `detalle-bucket-repo-${Date.now()}`;
const PERIODO = '2026-07';

describe('PrismaDetalleBucketRepository (integration)', () => {
  let prisma: PrismaClient;
  let repo: PrismaDetalleBucketRepository;
  let periodoVO: PeriodoMes;

  const createdAccountIds: string[] = [];

  beforeAll(async () => {
    if (!ALLOW) return;
    prisma = new PrismaClient();
    await prisma.$connect();
    repo = new PrismaDetalleBucketRepository(prisma, new NoOpCryptoService());
    periodoVO = PeriodoMes.crear(PERIODO).getValue();
  });

  afterAll(async () => {
    if (!ALLOW) return;
    if (createdAccountIds.length > 0) {
      await prisma.transaccion.deleteMany({
        where: { accountId: { in: createdAccountIds } },
      });
      await prisma.account.deleteMany({
        where: { id: { in: createdAccountIds } },
      });
    }
    await prisma.$disconnect();
  });

  /** Helper: seed an ingesta row (required FK for transacciones). */
  async function seedIngesta(
    accountId: string,
    suffix: string,
  ): Promise<string> {
    const ingestaId = `${RUN_ID}-ingesta-${suffix}`;
    // Same userId derivation as seedAccount — the owning user for this suffix.
    const userId = `${RUN_ID}-user-${suffix}`;
    await prisma.ingesta.upsert({
      where: { id: ingestaId },
      update: {},
      create: {
        id: ingestaId,
        userId,
        accountId,
        banco: 'TestBank',
        nombreArchivo: `test-${suffix}.xlsx`,
        estado: 'PROCESADA',
      },
    });
    return ingestaId;
  }

  /** Helper: seed a transaccion row. */
  async function seedTransaccion(opts: {
    accountId: string;
    ingestaId: string;
    bucketId: string | null;
    cargo: bigint;
    abono: bigint;
    fecha?: Date;
  }): Promise<string> {
    const tx = await prisma.transaccion.create({
      data: {
        accountId: opts.accountId,
        ingestaId: opts.ingestaId,
        bucketId: opts.bucketId,
        cargo: opts.cargo,
        abono: opts.abono,
        fecha: opts.fecha ?? new Date('2026-07-10T00:00:00.000Z'),
        descripcion: 'Test tx',
      },
    });
    return tx.id;
  }

  // ─── SC-01: filters by bucket + isolation fields present ──────────────────

  it('SC-01: returns only rows matching the queried bucket, with bank/account fields', async () => {
    if (!ALLOW) return;

    const userId = `${RUN_ID}-user-sc01`;
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, nombre: 'Test User sc01' },
    });
    const accountId = `${RUN_ID}-account-sc01`;
    await prisma.account.upsert({
      where: { id: accountId },
      update: {},
      create: {
        id: accountId,
        userId,
        banco: 'TestBank',
        tipoCuenta: 'CuentaCorriente',
        numeroCuenta: 'ACC-sc01',
      },
    });
    createdAccountIds.push(accountId);
    const ingestaId = await seedIngesta(accountId, 'sc01');

    const necId = await seedTransaccion({
      accountId,
      ingestaId,
      bucketId: BUCKET_IDS[Bucket.Necesidades],
      cargo: 50_000n,
      abono: 0n,
    });
    await seedTransaccion({
      accountId,
      ingestaId,
      bucketId: BUCKET_IDS[Bucket.Deseos],
      cargo: 20_000n,
      abono: 0n,
    });

    const rows = await repo.findByPeriodoYBucket(
      userId,
      periodoVO,
      Bucket.Necesidades,
    );

    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe(necId);
    expect(rows[0].banco).toBe('TestBank');
    expect(rows[0].tipoCuenta).toBe('CuentaCorriente');
    expect(rows[0].numeroCuenta).toBe('ACC-sc01');
  });

  // ─── SC-03: null-bucket AND legacy-SinCategoria fold → Deseos (issue #778 tramo 5b PR5) ──

  it('SC-03: Deseos query returns BOTH the null-bucketId row AND the legacy bucket-sincategoria row — no double count, no loss', async () => {
    if (!ALLOW) return;

    const userId = `${RUN_ID}-user-sc03`;
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, nombre: 'Test User sc03' },
    });
    const accountId = `${RUN_ID}-account-sc03`;
    await prisma.account.upsert({
      where: { id: accountId },
      update: {},
      create: {
        id: accountId,
        userId,
        banco: 'TestBank',
        tipoCuenta: 'CuentaCorriente',
        numeroCuenta: 'ACC-sc03',
      },
    });
    createdAccountIds.push(accountId);
    const ingestaId = await seedIngesta(accountId, 'sc03');

    const nullId = await seedTransaccion({
      accountId,
      ingestaId,
      bucketId: null,
      cargo: 150_000n,
      abono: 0n,
    });
    // issue #778 tramo 5b PR5 removed Bucket.SinCategoria from the domain —
    // a row still holding this legacy physical id is now an unrecognized
    // bucketId that folds to Deseos, exactly like null.
    const sinCategoriaLegacyId = await seedTransaccion({
      accountId,
      ingestaId,
      bucketId: ID_BUCKET_SINCATEGORIA_LEGACY,
      cargo: 50_000n,
      abono: 0n,
    });
    const deseosId = await seedTransaccion({
      accountId,
      ingestaId,
      bucketId: BUCKET_IDS[Bucket.Deseos],
      cargo: 20_000n,
      abono: 0n,
    });
    const necId = await seedTransaccion({
      accountId,
      ingestaId,
      bucketId: BUCKET_IDS[Bucket.Necesidades],
      cargo: 10_000n,
      abono: 0n,
    });

    // Deseos drill-down: null-fold row + legacy SinCategoria-id row + the
    // real Deseos row — all three, exactly once each (no double count).
    const deseosRows = await repo.findByPeriodoYBucket(
      userId,
      periodoVO,
      Bucket.Deseos,
    );
    const deseosIds = deseosRows.map((r) => r.id);
    expect(deseosIds).toContain(nullId);
    expect(deseosIds).toContain(sinCategoriaLegacyId);
    expect(deseosIds).toContain(deseosId);
    expect(deseosIds).not.toContain(necId);
    expect(deseosRows.length).toBe(3);
    const deseosTotal = deseosRows.reduce((acc, r) => acc + r.cargo, 0n);
    expect(deseosTotal).toBe(150_000n + 50_000n + 20_000n);

    // Querying a DIFFERENT bucket must NOT include either fold row
    // (no loss the other way: they don't leak into an unrelated bucket).
    const necRows = await repo.findByPeriodoYBucket(
      userId,
      periodoVO,
      Bucket.Necesidades,
    );
    const necIds = necRows.map((r) => r.id);
    expect(necIds).toEqual([necId]);
    expect(necIds).not.toContain(nullId);
    expect(necIds).not.toContain(sinCategoriaLegacyId);
  });

  it('SC-03: the null-bucketId (orphan) row displays under the user’s Desconocido de Deseos categoria, not "Sin categoría"', async () => {
    if (!ALLOW) return;

    const userId = `${RUN_ID}-user-sc03-desconocido`;
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, nombre: 'Test User sc03-desconocido' },
    });
    const accountId = `${RUN_ID}-account-sc03-desconocido`;
    await prisma.account.upsert({
      where: { id: accountId },
      update: {},
      create: {
        id: accountId,
        userId,
        banco: 'TestBank',
        tipoCuenta: 'CuentaCorriente',
        numeroCuenta: 'ACC-sc03-desconocido',
      },
    });
    createdAccountIds.push(accountId);
    const desconocidoId = `${RUN_ID}-cat-desconocido-deseos`;
    await prisma.categoria.create({
      data: {
        id: desconocidoId,
        userId,
        nombre: 'Desconocido',
        bucketId: BUCKET_IDS[Bucket.Deseos],
        esInterna: true,
      },
    });
    const ingestaId = await seedIngesta(accountId, 'sc03-desconocido');

    const nullId = await seedTransaccion({
      accountId,
      ingestaId,
      bucketId: null,
      cargo: 75_000n,
      abono: 0n,
    });

    const rows = await repo.findByPeriodoYBucket(
      userId,
      periodoVO,
      Bucket.Deseos,
    );
    const fila = rows.find((r) => r.id === nullId);

    expect(fila?.categoria).toEqual({
      id: desconocidoId,
      nombre: 'Desconocido',
      icono: null,
    });
  });

  it('grand-total invariant: summing cargo across all 5 buckets’ detail queries equals the total cargo seeded (no double count, no loss)', async () => {
    if (!ALLOW) return;

    const userId = `${RUN_ID}-user-sc03-invariante`;
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, nombre: 'Test User sc03-invariante' },
    });
    const accountId = `${RUN_ID}-account-sc03-invariante`;
    await prisma.account.upsert({
      where: { id: accountId },
      update: {},
      create: {
        id: accountId,
        userId,
        banco: 'TestBank',
        tipoCuenta: 'CuentaCorriente',
        numeroCuenta: 'ACC-sc03-invariante',
      },
    });
    createdAccountIds.push(accountId);
    const ingestaId = await seedIngesta(accountId, 'sc03-invariante');

    const cargos = [
      { bucketId: BUCKET_IDS[Bucket.Necesidades], cargo: 500_000n },
      { bucketId: BUCKET_IDS[Bucket.Deseos], cargo: 200_000n },
      { bucketId: BUCKET_IDS[Bucket.Ahorro], cargo: 300_000n },
      // issue #778 tramo 5b PR5: this legacy physical id is no longer a
      // real bucket — it's an unrecognized id that folds to Deseos.
      { bucketId: ID_BUCKET_SINCATEGORIA_LEGACY, cargo: 50_000n },
      { bucketId: null, cargo: 150_000n }, // orphan — must land in Deseos ONLY
      { bucketId: null, cargo: 25_000n }, // orphan — must land in Deseos ONLY
    ];
    let totalSeeded = 0n;
    for (const { bucketId, cargo } of cargos) {
      await seedTransaccion({
        accountId,
        ingestaId,
        bucketId,
        cargo,
        abono: 0n,
      });
      totalSeeded += cargo;
    }

    let totalLeido = 0n;
    for (const bucket of [
      Bucket.Necesidades,
      Bucket.Deseos,
      Bucket.Ahorro,
      // Bucket.Ingreso deliberately excluded — findByPeriodoYBucket
      // supports it but no Ingreso rows were seeded here.
    ]) {
      const rows = await repo.findByPeriodoYBucket(userId, periodoVO, bucket);
      totalLeido += rows.reduce((acc, r) => acc + r.cargo, 0n);
    }

    expect(totalLeido).toBe(totalSeeded);

    // Sharpen the invariant: Deseos alone must equal its own 4 rows
    // (200_000 real + 50_000 legacy-SinCategoria-id + 150_000 + 25_000
    // orphans) — proving the fold sources ADD together rather than one
    // silently overwriting or losing another (which would make the grand
    // total pass by coincidence — e.g. loss in one source offset by a gain
    // elsewhere).
    const deseosRows = await repo.findByPeriodoYBucket(
      userId,
      periodoVO,
      Bucket.Deseos,
    );
    expect(deseosRows.reduce((acc, r) => acc + r.cargo, 0n)).toBe(425_000n);
    expect(deseosRows.length).toBe(4);
  });

  // ─── CA-03: half-open window ───────────────────────────────────────────────

  it('CA-03: row at desde (2026-07-01T00:00:00.000Z) INCLUDED; row at hasta (2026-08-01) EXCLUDED', async () => {
    if (!ALLOW) return;

    const userId = `${RUN_ID}-user-ca03`;
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, nombre: 'Test User ca03' },
    });
    const accountId = `${RUN_ID}-account-ca03`;
    await prisma.account.upsert({
      where: { id: accountId },
      update: {},
      create: {
        id: accountId,
        userId,
        banco: 'TestBank',
        tipoCuenta: 'CuentaCorriente',
        numeroCuenta: 'ACC-ca03',
      },
    });
    createdAccountIds.push(accountId);
    const ingestaId = await seedIngesta(accountId, 'ca03');

    const firstId = await seedTransaccion({
      accountId,
      ingestaId,
      bucketId: BUCKET_IDS[Bucket.Necesidades],
      cargo: 1_000n,
      abono: 0n,
      fecha: new Date('2026-07-01T00:00:00.000Z'),
    });
    const augId = await seedTransaccion({
      accountId,
      ingestaId,
      bucketId: BUCKET_IDS[Bucket.Necesidades],
      cargo: 2_000n,
      abono: 0n,
      fecha: new Date('2026-08-01T00:00:00.000Z'),
    });

    const rows = await repo.findByPeriodoYBucket(
      userId,
      periodoVO,
      Bucket.Necesidades,
    );
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(firstId);
    expect(ids).not.toContain(augId);
  });

  // ─── User isolation (RNF-SEC-006) ─────────────────────────────────────────

  it('user isolation: user B rows NEVER appear in user A results', async () => {
    if (!ALLOW) return;

    const userIdA = `${RUN_ID}-user-iso-A`;
    const userIdB = `${RUN_ID}-user-iso-B`;
    await prisma.user.upsert({
      where: { id: userIdA },
      update: {},
      create: { id: userIdA, nombre: 'Test User iso A' },
    });
    await prisma.user.upsert({
      where: { id: userIdB },
      update: {},
      create: { id: userIdB, nombre: 'Test User iso B' },
    });
    const accountIdA = `${RUN_ID}-account-iso-A`;
    const accountIdB = `${RUN_ID}-account-iso-B`;
    await prisma.account.upsert({
      where: { id: accountIdA },
      update: {},
      create: {
        id: accountIdA,
        userId: userIdA,
        banco: 'TestBank',
        tipoCuenta: 'CuentaCorriente',
        numeroCuenta: 'ACC-iso-A',
      },
    });
    await prisma.account.upsert({
      where: { id: accountIdB },
      update: {},
      create: {
        id: accountIdB,
        userId: userIdB,
        banco: 'TestBank',
        tipoCuenta: 'CuentaCorriente',
        numeroCuenta: 'ACC-iso-B',
      },
    });
    createdAccountIds.push(accountIdA, accountIdB);
    const ingestaIdA = await seedIngesta(accountIdA, 'iso-A');
    const ingestaIdB = await seedIngesta(accountIdB, 'iso-B');

    await seedTransaccion({
      accountId: accountIdA,
      ingestaId: ingestaIdA,
      bucketId: BUCKET_IDS[Bucket.Necesidades],
      cargo: 500_000n,
      abono: 0n,
    });
    const userBTxId = await seedTransaccion({
      accountId: accountIdB,
      ingestaId: ingestaIdB,
      bucketId: BUCKET_IDS[Bucket.Necesidades],
      cargo: 4_500_000n,
      abono: 0n,
    });

    const rows = await repo.findByPeriodoYBucket(
      userIdA,
      periodoVO,
      Bucket.Necesidades,
    );
    const ids = rows.map((r) => r.id);
    expect(ids).not.toContain(userBTxId);
  });

  // ─── Ordering ───────────────────────────────────────────────────────────

  it('ordering: rows ordered by fecha asc then id asc as tiebreak', async () => {
    if (!ALLOW) return;

    const userId = `${RUN_ID}-user-order`;
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, nombre: 'Test User order' },
    });
    const accountId = `${RUN_ID}-account-order`;
    await prisma.account.upsert({
      where: { id: accountId },
      update: {},
      create: {
        id: accountId,
        userId,
        banco: 'TestBank',
        tipoCuenta: 'CuentaCorriente',
        numeroCuenta: 'ACC-order',
      },
    });
    createdAccountIds.push(accountId);
    const ingestaId = await seedIngesta(accountId, 'order');

    const earlierId = await seedTransaccion({
      accountId,
      ingestaId,
      bucketId: BUCKET_IDS[Bucket.Deseos],
      cargo: 200n,
      abono: 0n,
      fecha: new Date('2026-07-05T00:00:00.000Z'),
    });
    const sameDateId = await seedTransaccion({
      accountId,
      ingestaId,
      bucketId: BUCKET_IDS[Bucket.Deseos],
      cargo: 150n,
      abono: 0n,
      fecha: new Date('2026-07-05T00:00:00.000Z'),
    });
    const laterId = await seedTransaccion({
      accountId,
      ingestaId,
      bucketId: BUCKET_IDS[Bucket.Deseos],
      cargo: 100n,
      abono: 0n,
      fecha: new Date('2026-07-20T00:00:00.000Z'),
    });

    const rows = await repo.findByPeriodoYBucket(
      userId,
      periodoVO,
      Bucket.Deseos,
    );

    const earlierIdx = rows.findIndex((r) => r.id === earlierId);
    const sameDateIdx = rows.findIndex((r) => r.id === sameDateId);
    const laterIdx = rows.findIndex((r) => r.id === laterId);

    expect(earlierIdx).toBeLessThan(laterIdx);
    expect(earlierIdx).toBeLessThan(sameDateIdx);
    expect(sameDateIdx).toBeLessThan(laterIdx);
  });
});
