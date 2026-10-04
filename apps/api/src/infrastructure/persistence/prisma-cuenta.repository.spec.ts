import type { Mock } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { PrismaCuentaRepository } from './prisma-cuenta.repository';

const TABLAS = [
  'session',
  'transaccion',
  'ingesta',
  'patronClasificacion',
  'categoria',
  'account',
  'user',
] as const;

function makePrisma() {
  const llamadas: string[] = [];
  const modelo = (nombre: string) => ({
    deleteMany: vi.fn().mockImplementation((args: unknown) => {
      llamadas.push(nombre);
      return { nombre, args };
    }),
  });
  const prisma = {
    session: modelo('session'),
    transaccion: modelo('transaccion'),
    ingesta: modelo('ingesta'),
    patronClasificacion: modelo('patronClasificacion'),
    categoria: modelo('categoria'),
    account: modelo('account'),
    user: modelo('user'),
    $transaction: vi.fn().mockResolvedValue([]) as Mock,
  };
  return { prisma: prisma as unknown as PrismaClient, raw: prisma, llamadas };
}

describe('PrismaCuentaRepository.eliminar', () => {
  it('borra en UNA $transaction, en el orden que respeta las FKs', async () => {
    const { prisma, raw, llamadas } = makePrisma();

    await new PrismaCuentaRepository(prisma).eliminar('user-a');

    expect(raw.$transaction).toHaveBeenCalledTimes(1);
    const ops = raw.$transaction.mock.calls[0][0] as Array<{ nombre: string }>;
    expect(ops.map((o) => o.nombre)).toEqual([...TABLAS]);
    expect(llamadas).toEqual([...TABLAS]);
  });

  it('cada deleteMany está scoped por el userId (RNF-SEC-006)', async () => {
    const { prisma, raw } = makePrisma();

    await new PrismaCuentaRepository(prisma).eliminar('user-a');

    expect(raw.transaccion.deleteMany).toHaveBeenCalledWith({
      where: { account: { userId: 'user-a' } },
    });
    expect(raw.user.deleteMany).toHaveBeenCalledWith({
      where: { id: 'user-a' },
    });
    for (const t of TABLAS.filter((x) => x !== 'transaccion' && x !== 'user')) {
      expect(raw[t].deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-a' },
      });
    }
  });
});
