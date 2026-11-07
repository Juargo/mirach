import type { Mock } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaAprendizajeClasificacionWriter } from './prisma-aprendizaje-clasificacion.writer';
import { CategoriaDesconocidaError } from '../../domain/errors/categoria-desconocida.error';
import { TransaccionNoEncontradaError } from '../../domain/errors/transaccion-no-encontrada.error';

const CATEGORIA = {
  id: 'cat-t',
  nombre: 'Transporte',
  bucketId: 'bucket-deseos',
  bucket: { nombre: 'Deseos' },
};
const PATRON = {
  id: 'pat-1',
  categoriaId: 'cat-t',
  patron: 'cabify',
  matchType: 'CONTAINS',
  prioridad: 100,
};

function makePrisma(
  opts: { categoria?: unknown; reclasificados?: number } = {},
) {
  const tx = {
    categoria: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          opts.categoria === undefined ? CATEGORIA : opts.categoria,
        ),
    },
    patronClasificacion: {
      create: vi.fn().mockResolvedValue(PATRON),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findFirst: vi.fn().mockResolvedValue(PATRON),
    },
    transaccion: {
      updateMany: vi
        .fn()
        .mockImplementation(
          ({ data }: { data: { clasificacionManual?: boolean } }) =>
            Promise.resolve({
              count: data.clasificacionManual ? (opts.reclasificados ?? 1) : 2,
            }),
        ),
    },
  };
  const prisma = {
    $transaction: vi.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  } as unknown as PrismaClient;
  return { prisma, tx };
}

describe('PrismaAprendizajeClasificacionWriter', () => {
  it('creates the pattern and moves the rows inside ONE $transaction, userId in every WHERE', async () => {
    const { prisma, tx } = makePrisma();
    const writer = new PrismaAprendizajeClasificacionWriter(prisma);

    const r = await writer.aplicar('user-a', {
      categoriaId: 'cat-t',
      patron: {
        tipo: 'crear',
        patron: 'cabify',
        matchType: 'CONTAINS',
        prioridad: 100,
      },
      moverTransaccionIds: ['tx-1', 'tx-2'],
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.categoria.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'cat-t', userId: 'user-a' } }),
    );
    expect(tx.patronClasificacion.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-a',
        categoriaId: 'cat-t',
        patron: 'cabify',
        matchType: 'CONTAINS',
        prioridad: 100,
      },
    });
    expect(tx.transaccion.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['tx-1', 'tx-2'] },
        account: { userId: 'user-a' },
        clasificacionManual: false,
      },
      data: { categoriaId: 'cat-t', bucketId: 'bucket-deseos' },
    });
    expect(r.getValue()).toEqual({
      patron: PATRON,
      categoria: { id: 'cat-t', nombre: 'Transporte', bucket: 'Deseos' },
      movidos: 2,
    });
  });

  it('moves an existing pattern keeping its id (CLA-17)', async () => {
    const { prisma, tx } = makePrisma();
    const writer = new PrismaAprendizajeClasificacionWriter(prisma);

    await writer.aplicar('user-a', {
      categoriaId: 'cat-t',
      patron: { tipo: 'mover', patronId: 'pat-1' },
      moverTransaccionIds: [],
    });

    expect(tx.patronClasificacion.updateMany).toHaveBeenCalledWith({
      where: { id: 'pat-1', userId: 'user-a' },
      data: { categoriaId: 'cat-t' },
    });
    expect(tx.transaccion.updateMany).not.toHaveBeenCalled();
  });

  it('reclassifies the movement by hand first (S6)', async () => {
    const { prisma, tx } = makePrisma();
    const writer = new PrismaAprendizajeClasificacionWriter(prisma);

    await writer.aplicar('user-a', {
      categoriaId: 'cat-t',
      patron: { tipo: 'mantener', patronId: 'pat-1' },
      moverTransaccionIds: [],
      reclasificarTransaccionId: 'tx-9',
    });

    expect(tx.transaccion.updateMany).toHaveBeenCalledWith({
      where: { id: 'tx-9', account: { userId: 'user-a' } },
      data: {
        categoriaId: 'cat-t',
        bucketId: 'bucket-deseos',
        clasificacionManual: true,
      },
    });
  });

  it("a movement that is not the caller's fails and writes no pattern", async () => {
    const { prisma, tx } = makePrisma({ reclasificados: 0 });
    const writer = new PrismaAprendizajeClasificacionWriter(prisma);

    const r = await writer.aplicar('user-a', {
      categoriaId: 'cat-t',
      patron: {
        tipo: 'crear',
        patron: 'cabify',
        matchType: 'CONTAINS',
        prioridad: 100,
      },
      moverTransaccionIds: ['tx-1'],
      reclasificarTransaccionId: 'tx-ajena',
    });

    expect(r.getError()).toBeInstanceOf(TransaccionNoEncontradaError);
    expect(tx.patronClasificacion.create).not.toHaveBeenCalled();
  });

  it("a category that is not the caller's fails before any write", async () => {
    const { prisma, tx } = makePrisma({ categoria: null });
    const writer = new PrismaAprendizajeClasificacionWriter(prisma);

    const r = await writer.aplicar('user-a', {
      categoriaId: 'cat-ajena',
      patron: {
        tipo: 'crear',
        patron: 'cabify',
        matchType: 'CONTAINS',
        prioridad: 100,
      },
      moverTransaccionIds: ['tx-1'],
    });

    expect(r.getError()).toBeInstanceOf(CategoriaDesconocidaError);
    expect(tx.transaccion.updateMany as Mock).not.toHaveBeenCalled();
  });
});
