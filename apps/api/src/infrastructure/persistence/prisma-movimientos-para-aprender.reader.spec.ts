import type { Mock } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaMovimientosParaAprenderReader } from './prisma-movimientos-para-aprender.reader';
import { PeriodoMes } from '../../domain/value-objects/periodo-mes';
import { DiaCorte } from '../../domain/value-objects/mes-financiero';

const ROW = {
  id: 'tx-1',
  fecha: new Date('2026-07-10T00:00:00.000Z'),
  descripcion: 'cifrado:CABIFY',
  cargo: 4500n,
  abono: 0n,
  categoriaId: 'cat-1',
  clasificacionManual: false,
};

function makePrisma(rows: unknown[] = [ROW], one: unknown = ROW) {
  return {
    transaccion: {
      findMany: vi.fn().mockResolvedValue(rows),
      findFirst: vi.fn().mockResolvedValue(one),
    },
  } as unknown as PrismaClient;
}

const crypto = {
  encrypt: (v: string) => v,
  decrypt: (v: string) => v.replace('cifrado:', ''),
};

function periodo(): PeriodoMes {
  return PeriodoMes.crear('2026-07', DiaCorte.CALENDARIO).getValue();
}

describe('PrismaMovimientosParaAprenderReader', () => {
  it('buscarDelPeriodo: userId and the period date range in the SQL WHERE (RNF-SEC-006)', async () => {
    const prisma = makePrisma();
    const reader = new PrismaMovimientosParaAprenderReader(prisma, crypto);

    await reader.buscarDelPeriodo('user-a', periodo());

    expect(prisma.transaccion.findMany as Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          account: { userId: 'user-a' },
          fecha: {
            gte: new Date('2026-07-01T00:00:00.000Z'),
            lt: new Date('2026-08-01T00:00:00.000Z'),
          },
        },
      }),
    );
  });

  it('decrypts descripcion in memory (ADR-009) and keeps exact amounts', async () => {
    const reader = new PrismaMovimientosParaAprenderReader(
      makePrisma(),
      crypto,
    );

    await expect(reader.buscarDelPeriodo('user-a', periodo())).resolves.toEqual(
      [
        {
          id: 'tx-1',
          fecha: ROW.fecha,
          descripcion: 'CABIFY',
          cargo: 4500n,
          abono: 0n,
          categoriaIdActual: 'cat-1',
          clasificacionManual: false,
        },
      ],
    );
  });

  it("buscarPorId: id and userId in the SQL WHERE; null when not the caller's", async () => {
    const prisma = makePrisma([], null);
    const reader = new PrismaMovimientosParaAprenderReader(prisma, crypto);

    await expect(reader.buscarPorId('user-a', 'tx-9')).resolves.toBeNull();
    expect(prisma.transaccion.findFirst as Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tx-9', account: { userId: 'user-a' } },
      }),
    );
  });
});
