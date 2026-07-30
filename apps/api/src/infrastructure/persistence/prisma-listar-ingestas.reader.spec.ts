import type { Mock } from 'vitest';
import { PrismaListarIngestasReader } from './prisma-listar-ingestas.reader';
import { PrismaClient } from '@prisma/client';

/**
 * Unit tests for PrismaListarIngestasReader — mocked PrismaClient
 * (US-018, design.md §5.2).
 */
describe('PrismaListarIngestasReader.listarPorUsuario', () => {
  function makePrisma(rows: unknown[]): {
    prisma: PrismaClient;
    findMany: Mock;
  } {
    const findMany: Mock = vi.fn().mockResolvedValue(rows);
    const prisma = {
      ingesta: { findMany },
    } as unknown as PrismaClient;
    return { prisma, findMany };
  }

  it('T1.8a: WHERE userId-scoped + estado PROCESADA, orderBy creadoEn desc', async () => {
    const { prisma, findMany } = makePrisma([]);
    const reader = new PrismaListarIngestasReader(prisma);

    await reader.listarPorUsuario('user-a');

    expect(findMany).toHaveBeenCalledWith({
      where: { account: { userId: 'user-a' }, estado: 'PROCESADA' },
      orderBy: { creadoEn: 'desc' },
      select: {
        id: true,
        banco: true,
        creadoEn: true,
        totalTransacciones: true,
      },
    });
  });

  it('T1.8b: mapea cada fila a IngestaResumen (id, banco, fecha=creadoEn, totalTransacciones)', async () => {
    const fecha = new Date('2026-07-15T00:00:00.000Z');
    const { prisma } = makePrisma([
      { id: 'ing-1', banco: 'BCI', creadoEn: fecha, totalTransacciones: 10 },
    ]);
    const reader = new PrismaListarIngestasReader(prisma);

    const result = await reader.listarPorUsuario('user-a');

    expect(result).toEqual([
      { id: 'ing-1', banco: 'BCI', fecha, totalTransacciones: 10 },
    ]);
  });

  it('T1.8c: totalTransacciones nulo coalesce a 0 (defensivo — PROCESADA lo garantiza no-nulo)', async () => {
    const fecha = new Date('2026-07-15T00:00:00.000Z');
    const { prisma } = makePrisma([
      {
        id: 'ing-2',
        banco: 'Santander',
        creadoEn: fecha,
        totalTransacciones: null,
      },
    ]);
    const reader = new PrismaListarIngestasReader(prisma);

    const result = await reader.listarPorUsuario('user-a');

    expect(result[0].totalTransacciones).toBe(0);
  });
});
