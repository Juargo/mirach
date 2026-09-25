import type { Mock } from 'vitest';
import { PrismaMovimientosMesRepository } from './prisma-movimientos-mes.repository';
import { PrismaClient } from '@prisma/client';
import { PeriodoMes } from '../../domain/value-objects/periodo-mes';
import { Bucket } from '../../domain/value-objects/bucket';
import { BUCKET_IDS } from './bucket-ids';
import { ICryptoService } from '../../application/ports/crypto-service.port';
import { appLogger } from '../logging/app-logger';

function makeCrypto(decryptFn?: (v: string) => string): ICryptoService {
  return {
    encrypt: (v: string) => v,
    decrypt: decryptFn ?? ((v: string) => v),
  };
}

/**
 * Unit tests for PrismaMovimientosMesRepository — mocked PrismaClient.
 *
 * Covers the physical bucketId → domain Bucket fold (MOV-01), mirroring the
 * fold already proven in prisma-resumen-mes.repository.ts (issue #778 tramo
 * 5b): recognized id → its Bucket; null → Deseos; unrecognized non-null id
 * → Deseos too (integrity anomaly, same target as null — see bucket-ids.ts
 * docblock); per-row independence (SC-03 — folding one row must never
 * reclassify another row, since this is a per-row `map`, not a `groupBy`
 * accumulator). DB-backed scenarios (ordering, money exactness, userId
 * isolation end-to-end) are covered by the deferred int-spec suite.
 */
describe('PrismaMovimientosMesRepository', () => {
  const periodo = PeriodoMes.crear('2026-07').getValue();

  function makeRow(overrides: {
    id: string;
    bucketId: string | null;
    categoria?: { id: string; nombre: string } | null;
  }) {
    return {
      id: overrides.id,
      fecha: new Date('2026-07-10T00:00:00.000Z'),
      descripcion: 'Test tx',
      cargo: 1000n,
      abono: 0n,
      bucketId: overrides.bucketId,
      categoria: overrides.categoria ?? null,
      account: {
        banco: 'BCI',
        tipoCuenta: 'Cuenta Corriente',
        numeroCuenta: 'acc-1',
      },
    };
  }

  it('MOV-01: recognized bucketId folds to its domain Bucket', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([
        makeRow({ id: 'tx-nec', bucketId: BUCKET_IDS[Bucket.Necesidades] }),
      ]);
    const prisma = { transaccion: { findMany } } as unknown as PrismaClient;
    const repo = new PrismaMovimientosMesRepository(prisma, makeCrypto());

    const rows = await repo.findByPeriodo('user-1', periodo);

    expect(rows[0].bucket).toBe(Bucket.Necesidades);
  });

  it('MOV-01 (#778 tramo 5b): null bucketId folds to Deseos, not SinCategoria', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([makeRow({ id: 'tx-null', bucketId: null })]);
    const prisma = {
      transaccion: { findMany },
      categoria: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaClient;
    const repo = new PrismaMovimientosMesRepository(prisma, makeCrypto());

    const rows = await repo.findByPeriodo('user-1', periodo);

    expect(rows[0].bucket).toBe(Bucket.Deseos);
  });

  it('MOV-01 (#778 tramo 5b): unrecognized non-null bucketId folds to Deseos (integrity anomaly)', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([
        makeRow({ id: 'tx-unknown', bucketId: 'not-a-real-bucket-id' }),
      ]);
    const prisma = {
      transaccion: { findMany },
      categoria: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaClient;
    const repo = new PrismaMovimientosMesRepository(prisma, makeCrypto());

    const rows = await repo.findByPeriodo('user-1', periodo);

    expect(rows[0].bucket).toBe(Bucket.Deseos);
  });

  it('MOV-01/SC-03: per-row independence — one row folding to Deseos never reclassifies another row', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([
        makeRow({ id: 'tx-nec', bucketId: BUCKET_IDS[Bucket.Necesidades] }),
        makeRow({ id: 'tx-null', bucketId: null }),
      ]);
    const prisma = {
      transaccion: { findMany },
      categoria: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaClient;
    const repo = new PrismaMovimientosMesRepository(prisma, makeCrypto());

    const rows = await repo.findByPeriodo('user-1', periodo);
    const byId = new Map(rows.map((r) => [r.id, r.bucket]));

    expect(byId.get('tx-nec')).toBe(Bucket.Necesidades);
    expect(byId.get('tx-null')).toBe(Bucket.Deseos);
  });

  // ─── #778 tramo 5b: Desconocido display-fold for orphan rows ────────────

  describe('null-bucket orphan rows fold to the user’s Desconocido de Deseos', () => {
    it('bucketId null AND categoria null → categoria becomes the fetched Desconocido de Deseos', async () => {
      const findMany = vi
        .fn()
        .mockResolvedValue([makeRow({ id: 'tx-huerfana', bucketId: null })]);
      const findFirst = vi.fn().mockResolvedValue({
        id: 'cat-desconocido-deseos',
        nombre: 'Desconocido',
      });
      const prisma = {
        transaccion: { findMany },
        categoria: { findFirst },
      } as unknown as PrismaClient;
      const repo = new PrismaMovimientosMesRepository(prisma, makeCrypto());

      const rows = await repo.findByPeriodo('user-1', periodo);

      expect(rows[0].categoria).toEqual({
        id: 'cat-desconocido-deseos',
        nombre: 'Desconocido',
      });
      // Scoped by userId (RNF-SEC-006) — the lookup must never be tenant-blind.
      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'user-1' }),
        }),
      );
    });

    it('catalog incomplete (no Desconocido de Deseos for this user) → categoria stays null, does not throw', async () => {
      const findMany = vi
        .fn()
        .mockResolvedValue([makeRow({ id: 'tx-huerfana', bucketId: null })]);
      const prisma = {
        transaccion: { findMany },
        categoria: { findFirst: vi.fn().mockResolvedValue(null) },
      } as unknown as PrismaClient;
      const repo = new PrismaMovimientosMesRepository(prisma, makeCrypto());

      const rows = await repo.findByPeriodo('user-1', periodo);

      expect(rows[0].categoria).toBeNull();
    });

    it('a row that already carries a real categoria keeps it — the fold NEVER overwrites an existing categoria', async () => {
      const findMany = vi.fn().mockResolvedValue([
        makeRow({
          id: 'tx-ya-categorizada',
          bucketId: null,
          categoria: { id: 'cat-real', nombre: 'Supermercado' },
        }),
      ]);
      const findFirst = vi.fn();
      const prisma = {
        transaccion: { findMany },
        categoria: { findFirst },
      } as unknown as PrismaClient;
      const repo = new PrismaMovimientosMesRepository(prisma, makeCrypto());

      const rows = await repo.findByPeriodo('user-1', periodo);

      expect(rows[0].categoria).toEqual({
        id: 'cat-real',
        nombre: 'Supermercado',
      });
      // No orphan row exists (categoria already set) — the lookup must not fire.
      expect(findFirst).not.toHaveBeenCalled();
    });

    it('no orphan rows in the page → the Desconocido lookup never runs (no N+1, no unconditional query)', async () => {
      const findMany = vi
        .fn()
        .mockResolvedValue([
          makeRow({ id: 'tx-nec', bucketId: BUCKET_IDS[Bucket.Necesidades] }),
        ]);
      const findFirst = vi.fn();
      const prisma = {
        transaccion: { findMany },
        categoria: { findFirst },
      } as unknown as PrismaClient;
      const repo = new PrismaMovimientosMesRepository(prisma, makeCrypto());

      await repo.findByPeriodo('user-1', periodo);

      expect(findFirst).not.toHaveBeenCalled();
    });

    it('several orphan rows in the same page trigger the Desconocido lookup exactly ONCE (no N+1)', async () => {
      const findMany = vi
        .fn()
        .mockResolvedValue([
          makeRow({ id: 'tx-huerfana-1', bucketId: null }),
          makeRow({ id: 'tx-huerfana-2', bucketId: null }),
          makeRow({ id: 'tx-huerfana-3', bucketId: null }),
        ]);
      const findFirst = vi.fn().mockResolvedValue({
        id: 'cat-desconocido-deseos',
        nombre: 'Desconocido',
      });
      const prisma = {
        transaccion: { findMany },
        categoria: { findFirst },
      } as unknown as PrismaClient;
      const repo = new PrismaMovimientosMesRepository(prisma, makeCrypto());

      await repo.findByPeriodo('user-1', periodo);

      expect(findFirst).toHaveBeenCalledTimes(1);
    });

    it('logs a WARN with userId + count only (never montos/descripcion, ADR-013) when orphan rows are found', async () => {
      const findMany = vi
        .fn()
        .mockResolvedValue([
          makeRow({ id: 'tx-huerfana-1', bucketId: null }),
          makeRow({ id: 'tx-huerfana-2', bucketId: null }),
        ]);
      const prisma = {
        transaccion: { findMany },
        categoria: { findFirst: vi.fn().mockResolvedValue(null) },
      } as unknown as PrismaClient;
      const repo = new PrismaMovimientosMesRepository(prisma, makeCrypto());
      const warnSpy = vi.spyOn(appLogger, 'warn').mockImplementation(() => {});

      await repo.findByPeriodo('user-orphan', periodo);

      expect(warnSpy).toHaveBeenCalledTimes(1);
      const [, context] = warnSpy.mock.calls[0];
      expect(context).toEqual(
        expect.objectContaining({ userId: 'user-orphan', filasSinBucket: 2 }),
      );
      const serialized = JSON.stringify(warnSpy.mock.calls[0]);
      expect(serialized).not.toContain('Test tx'); // descripcion never logged
      expect(serialized).not.toContain('1000'); // cargo never logged
      warnSpy.mockRestore();
    });

    it('no orphan rows → no WARN is logged', async () => {
      const findMany = vi
        .fn()
        .mockResolvedValue([
          makeRow({ id: 'tx-nec', bucketId: BUCKET_IDS[Bucket.Necesidades] }),
        ]);
      const prisma = {
        transaccion: { findMany },
        categoria: { findFirst: vi.fn() },
      } as unknown as PrismaClient;
      const repo = new PrismaMovimientosMesRepository(prisma, makeCrypto());
      const warnSpy = vi.spyOn(appLogger, 'warn').mockImplementation(() => {});

      await repo.findByPeriodo('user-1', periodo);

      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  it('CAT037-06: classified categoria (per-user cuid + nombre) folds to { id, nombre }', async () => {
    const findMany = vi.fn().mockResolvedValue([
      makeRow({
        id: 'tx-super',
        bucketId: BUCKET_IDS[Bucket.Necesidades],
        categoria: {
          id: 'cly-per-user-supermercado-cuid',
          nombre: 'Supermercado',
        },
      }),
    ]);
    const prisma = { transaccion: { findMany } } as unknown as PrismaClient;
    const repo = new PrismaMovimientosMesRepository(prisma, makeCrypto());

    const rows = await repo.findByPeriodo('user-1', periodo);

    expect(rows[0].categoria).toEqual({
      id: 'cly-per-user-supermercado-cuid',
      nombre: 'Supermercado',
    });
  });

  it('CAT037-06: null categoria (Ingreso/SinCategoria row) folds to null', async () => {
    const findMany = vi.fn().mockResolvedValue([
      makeRow({
        id: 'tx-ingreso',
        bucketId: BUCKET_IDS[Bucket.Ingreso],
        categoria: null,
      }),
    ]);
    const prisma = { transaccion: { findMany } } as unknown as PrismaClient;
    const repo = new PrismaMovimientosMesRepository(prisma, makeCrypto());

    const rows = await repo.findByPeriodo('user-1', periodo);

    expect(rows[0].categoria).toBeNull();
  });

  it('CAT037-06/D-01: an arbitrary owned category name passes through verbatim (no enum gate)', async () => {
    const findMany = vi.fn().mockResolvedValue([
      makeRow({
        id: 'tx-mascotas',
        bucketId: BUCKET_IDS[Bucket.Deseos],
        categoria: { id: 'cly-some-cuid', nombre: 'Mascotas' },
      }),
    ]);
    const prisma = { transaccion: { findMany } } as unknown as PrismaClient;
    const repo = new PrismaMovimientosMesRepository(prisma, makeCrypto());

    const rows = await repo.findByPeriodo('user-1', periodo);

    expect(rows[0].categoria).toEqual({
      id: 'cly-some-cuid',
      nombre: 'Mascotas',
    });
  });

  it('CAT037-06: select uses the nested categoria relation, not a raw categoriaId scalar', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { transaccion: { findMany } } as unknown as PrismaClient;
    const repo = new PrismaMovimientosMesRepository(prisma, makeCrypto());

    await repo.findByPeriodo('user-1', periodo);

    expect(findMany as Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          categoria: { select: { id: true, nombre: true } },
        }),
      }),
    );
  });

  it('ADR-013: descripcion pasa por crypto.decrypt() antes de devolverse — GET /api/movimientos NUNCA expone ciphertext', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        ...makeRow({ id: 'tx-1', bucketId: BUCKET_IDS[Bucket.Necesidades] }),
        descripcion: 'cifrado-xyz',
      },
    ]);
    const prisma = { transaccion: { findMany } } as unknown as PrismaClient;
    const repo = new PrismaMovimientosMesRepository(
      prisma,
      makeCrypto((v) => `plano:${v}`),
    );

    const rows = await repo.findByPeriodo('user-1', periodo);

    expect(rows[0].descripcion).toBe('plano:cifrado-xyz');
  });

  it('US-035: numeroCuenta pasa por crypto.decrypt() antes de devolverse — GET /api/movimientos NUNCA expone el ciphertext de numeroCuenta', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        ...makeRow({ id: 'tx-1', bucketId: BUCKET_IDS[Bucket.Necesidades] }),
        account: {
          banco: 'BCI',
          tipoCuenta: 'Cuenta Corriente',
          numeroCuenta: 'cifrado-numero-xyz',
        },
      },
    ]);
    const prisma = { transaccion: { findMany } } as unknown as PrismaClient;
    const repo = new PrismaMovimientosMesRepository(
      prisma,
      makeCrypto((v) => `plano:${v}`),
    );

    const rows = await repo.findByPeriodo('user-1', periodo);

    expect(rows[0].numeroCuenta).toBe('plano:cifrado-numero-xyz');
  });

  it('user isolation: findByPeriodo filters structurally by account.userId (RNF-SEC-006)', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { transaccion: { findMany } } as unknown as PrismaClient;
    const repo = new PrismaMovimientosMesRepository(prisma, makeCrypto());

    await repo.findByPeriodo('user-abc', periodo);

    expect(findMany as Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ account: { userId: 'user-abc' } }),
      }),
    );
  });
});
