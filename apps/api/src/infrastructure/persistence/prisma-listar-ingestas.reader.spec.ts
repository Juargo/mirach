import type { Mock } from 'vitest';
import { PrismaListarIngestasReader } from './prisma-listar-ingestas.reader';
import { PrismaClient } from '@prisma/client';

/**
 * Unit tests for PrismaListarIngestasReader — mocked PrismaClient
 * (US-004, design.md §4.1). Widens US-018's reader: drops the bare
 * `estado: PROCESADA` filter for `estado: { in: [PROCESADA, FALLIDA] }`, and
 * switches isolation from the `account: { userId }` join to the direct
 * `Ingesta.userId` column — the only mechanism that can isolate an
 * `accountId = null` FALLIDA row (RNF-SEC-006, ING-08).
 */
describe('PrismaListarIngestasReader.listarPorUsuario (US-004)', () => {
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

  it('WHERE userId-scoped (NO account join) + estado in [PROCESADA, FALLIDA], orderBy creadoEn desc', async () => {
    const { prisma, findMany } = makePrisma([]);
    const reader = new PrismaListarIngestasReader(prisma);

    await reader.listarPorUsuario('user-a');

    expect(findMany).toHaveBeenCalledWith({
      where: { userId: 'user-a', estado: { in: ['PROCESADA', 'FALLIDA'] } },
      orderBy: { creadoEn: 'desc' },
      select: {
        id: true,
        banco: true,
        nombreArchivo: true,
        estado: true,
        motivoFallo: true,
        creadoEn: true,
        totalTransacciones: true,
      },
    });
  });

  it('mapea una fila PROCESADA a IngestaResumen completo', async () => {
    const fecha = new Date('2026-07-15T00:00:00.000Z');
    const { prisma } = makePrisma([
      {
        id: 'ing-1',
        banco: 'BCI',
        nombreArchivo: 'movimientos.xlsx',
        estado: 'PROCESADA',
        motivoFallo: null,
        creadoEn: fecha,
        totalTransacciones: 10,
      },
    ]);
    const reader = new PrismaListarIngestasReader(prisma);

    const result = await reader.listarPorUsuario('user-a');

    expect(result).toEqual([
      {
        id: 'ing-1',
        banco: 'BCI',
        nombreArchivo: 'movimientos.xlsx',
        estado: 'PROCESADA',
        motivoFallo: null,
        fecha,
        totalTransacciones: 10,
      },
    ]);
  });

  it('mapea una fila FALLIDA con banco=null, totalTransacciones coalescido a 0, y motivoFallo presente', async () => {
    const fecha = new Date('2026-07-16T00:00:00.000Z');
    const { prisma } = makePrisma([
      {
        id: 'ing-2',
        banco: null,
        nombreArchivo: 'cartola.docx',
        estado: 'FALLIDA',
        motivoFallo: 'extensión no permitida: .docx',
        creadoEn: fecha,
        totalTransacciones: null,
      },
    ]);
    const reader = new PrismaListarIngestasReader(prisma);

    const result = await reader.listarPorUsuario('user-a');

    expect(result).toEqual([
      {
        id: 'ing-2',
        banco: null,
        nombreArchivo: 'cartola.docx',
        estado: 'FALLIDA',
        motivoFallo: 'extensión no permitida: .docx',
        fecha,
        totalTransacciones: 0,
      },
    ]);
  });

  it('totalTransacciones nulo (PROCESADA legacy) coalesce a 0 (defensivo)', async () => {
    const fecha = new Date('2026-07-15T00:00:00.000Z');
    const { prisma } = makePrisma([
      {
        id: 'ing-3',
        banco: 'Santander',
        nombreArchivo: 'x.xlsx',
        estado: 'PROCESADA',
        motivoFallo: null,
        creadoEn: fecha,
        totalTransacciones: null,
      },
    ]);
    const reader = new PrismaListarIngestasReader(prisma);

    const result = await reader.listarPorUsuario('user-a');

    expect(result[0].totalTransacciones).toBe(0);
  });

  it('aIngestaEstado (narrowing infra-boundary): un estado inesperado (p.ej. PENDIENTE leaking) LANZA en vez de mentirle al tipo', async () => {
    const fecha = new Date('2026-07-15T00:00:00.000Z');
    const { prisma } = makePrisma([
      {
        id: 'ing-4',
        banco: null,
        nombreArchivo: 'x.xlsx',
        estado: 'PENDIENTE',
        motivoFallo: null,
        creadoEn: fecha,
        totalTransacciones: null,
      },
    ]);
    const reader = new PrismaListarIngestasReader(prisma);

    await expect(reader.listarPorUsuario('user-a')).rejects.toThrow(
      /estado inesperado/,
    );
  });
});
