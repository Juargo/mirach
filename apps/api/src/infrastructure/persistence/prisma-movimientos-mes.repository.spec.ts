import type { Mock } from 'vitest';
import { PrismaMovimientosMesRepository } from './prisma-movimientos-mes.repository';
import { PrismaService } from './prisma.service';
import { PeriodoMes } from '../../domain/value-objects/periodo-mes';
import { Bucket } from '../../domain/value-objects/bucket';
import { BUCKET_IDS } from './bucket-ids';

/**
 * Unit tests for PrismaMovimientosMesRepository — mocked PrismaService.
 *
 * Covers the physical bucketId → domain Bucket fold (MOV-01), mirroring the
 * fold already proven in prisma-resumen-mes.repository.ts: recognized id →
 * its Bucket; null → SinCategoria; unrecognized non-null id → SinCategoria
 * (defensive); per-row independence (SC-03 — folding one row's SinCategoria
 * must never reclassify another row, since this is a per-row `map`, not a
 * `groupBy` accumulator). DB-backed scenarios (ordering, money exactness,
 * userId isolation end-to-end) are covered by the deferred int-spec suite.
 */
describe('PrismaMovimientosMesRepository', () => {
  const periodo = PeriodoMes.crear('2026-07').getValue() as PeriodoMes;

  function makeRow(overrides: { id: string; bucketId: string | null }) {
    return {
      id: overrides.id,
      fecha: new Date('2026-07-10T00:00:00.000Z'),
      descripcion: 'Test tx',
      cargo: 1000n,
      abono: 0n,
      bucketId: overrides.bucketId,
      account: { banco: 'BCI', tipoCuenta: 'Cuenta Corriente', numeroCuenta: 'acc-1' },
    };
  }

  it('MOV-01: recognized bucketId folds to its domain Bucket', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([makeRow({ id: 'tx-nec', bucketId: BUCKET_IDS[Bucket.Necesidades] })]);
    const prisma = { transaccion: { findMany } } as unknown as PrismaService;
    const repo = new PrismaMovimientosMesRepository(prisma);

    const rows = await repo.findByPeriodo('user-1', periodo);

    expect(rows[0]!.bucket).toBe(Bucket.Necesidades);
  });

  it('MOV-01: null bucketId folds to SinCategoria', async () => {
    const findMany = vi.fn().mockResolvedValue([makeRow({ id: 'tx-null', bucketId: null })]);
    const prisma = { transaccion: { findMany } } as unknown as PrismaService;
    const repo = new PrismaMovimientosMesRepository(prisma);

    const rows = await repo.findByPeriodo('user-1', periodo);

    expect(rows[0]!.bucket).toBe(Bucket.SinCategoria);
  });

  it('MOV-01: unrecognized non-null bucketId folds to SinCategoria (defensive)', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([makeRow({ id: 'tx-unknown', bucketId: 'not-a-real-bucket-id' })]);
    const prisma = { transaccion: { findMany } } as unknown as PrismaService;
    const repo = new PrismaMovimientosMesRepository(prisma);

    const rows = await repo.findByPeriodo('user-1', periodo);

    expect(rows[0]!.bucket).toBe(Bucket.SinCategoria);
  });

  it('MOV-01/SC-03: per-row independence — one row folding to SinCategoria never reclassifies another row', async () => {
    const findMany = vi.fn().mockResolvedValue([
      makeRow({ id: 'tx-nec', bucketId: BUCKET_IDS[Bucket.Necesidades] }),
      makeRow({ id: 'tx-null', bucketId: null }),
    ]);
    const prisma = { transaccion: { findMany } } as unknown as PrismaService;
    const repo = new PrismaMovimientosMesRepository(prisma);

    const rows = await repo.findByPeriodo('user-1', periodo);
    const byId = new Map(rows.map((r) => [r.id, r.bucket]));

    expect(byId.get('tx-nec')).toBe(Bucket.Necesidades);
    expect(byId.get('tx-null')).toBe(Bucket.SinCategoria);
  });

  it('user isolation: findByPeriodo filters structurally by account.userId (RNF-SEC-006)', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { transaccion: { findMany } } as unknown as PrismaService;
    const repo = new PrismaMovimientosMesRepository(prisma);

    await repo.findByPeriodo('user-abc', periodo);

    expect(findMany as Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ account: { userId: 'user-abc' } }),
      }),
    );
  });
});
