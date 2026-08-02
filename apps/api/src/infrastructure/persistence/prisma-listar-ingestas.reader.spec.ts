import type { Mock } from 'vitest';
import { PrismaListarIngestasReader } from './prisma-listar-ingestas.reader';
import { PrismaClient } from '@prisma/client';

/**
 * Unit tests for PrismaListarIngestasReader — mocked PrismaClient
 * (US-018 base; US-004 amplía a historial completo con estado + motivoFallo).
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

  it('T4.1a: WHERE userId-scoped SIN filtro de estado (US-004: historial completo), orderBy creadoEn desc, select con nombreArchivo/estado/motivoFallo', async () => {
    const { prisma, findMany } = makePrisma([]);
    const reader = new PrismaListarIngestasReader(prisma);

    await reader.listarPorUsuario('user-a');

    expect(findMany).toHaveBeenCalledWith({
      where: { account: { userId: 'user-a' } },
      orderBy: { creadoEn: 'desc' },
      select: {
        id: true,
        banco: true,
        nombreArchivo: true,
        creadoEn: true,
        estado: true,
        totalTransacciones: true,
        motivoFallo: true,
      },
    });
  });

  it('T4.1b: mapea una ingesta PROCESADA → estado "exitoso", motivoFallo null', async () => {
    const fecha = new Date('2026-07-15T00:00:00.000Z');
    const { prisma } = makePrisma([
      {
        id: 'ing-1',
        banco: 'BCI',
        nombreArchivo: 'movimientos.xlsx',
        creadoEn: fecha,
        estado: 'PROCESADA',
        totalTransacciones: 10,
        motivoFallo: null,
      },
    ]);
    const reader = new PrismaListarIngestasReader(prisma);

    const result = await reader.listarPorUsuario('user-a');

    expect(result).toEqual([
      {
        id: 'ing-1',
        banco: 'BCI',
        nombreArchivo: 'movimientos.xlsx',
        fecha,
        estado: 'exitoso',
        totalTransacciones: 10,
        motivoFallo: null,
      },
    ]);
  });

  it('T4.1c: mapea una ingesta FALLIDA → estado "fallido" conservando motivoFallo (CA-04)', async () => {
    const fecha = new Date('2026-07-15T00:00:00.000Z');
    const { prisma } = makePrisma([
      {
        id: 'ing-2',
        banco: 'Santander',
        nombreArchivo: 'rota.xlsx',
        creadoEn: fecha,
        estado: 'FALLIDA',
        totalTransacciones: null,
        motivoFallo: 'Formato de fecha no reconocido',
      },
    ]);
    const reader = new PrismaListarIngestasReader(prisma);

    const result = await reader.listarPorUsuario('user-a');

    expect(result[0]).toEqual({
      id: 'ing-2',
      banco: 'Santander',
      nombreArchivo: 'rota.xlsx',
      fecha,
      estado: 'fallido',
      totalTransacciones: 0,
      motivoFallo: 'Formato de fecha no reconocido',
    });
  });

  it('T4.1d: mapea una ingesta PENDIENTE → estado "pendiente"', async () => {
    const fecha = new Date('2026-07-15T00:00:00.000Z');
    const { prisma } = makePrisma([
      {
        id: 'ing-3',
        banco: 'BancoEstado',
        nombreArchivo: 'a-medias.xlsx',
        creadoEn: fecha,
        estado: 'PENDIENTE',
        totalTransacciones: null,
        motivoFallo: null,
      },
    ]);
    const reader = new PrismaListarIngestasReader(prisma);

    const result = await reader.listarPorUsuario('user-a');

    expect(result[0].estado).toBe('pendiente');
    expect(result[0].totalTransacciones).toBe(0);
  });
});
