import type { Mock } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { PrismaCuentaRepository } from './prisma-cuenta.repository';

const TABLAS = [
  'session',
  'consentimiento',
  'suscripcion',
  'permisoPlan',
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
    consentimiento: modelo('consentimiento'),
    suscripcion: modelo('suscripcion'),
    permisoPlan: modelo('permisoPlan'),
    transaccion: modelo('transaccion'),
    ingesta: modelo('ingesta'),
    patronClasificacion: modelo('patronClasificacion'),
    categoria: modelo('categoria'),
    account: modelo('account'),
    user: modelo('user'),
    $queryRaw: vi.fn().mockImplementation((sql: { values: unknown[] }) => {
      llamadas.push('lock');
      return { nombre: 'lock', valores: sql.values };
    }),
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
    expect(ops.map((o) => o.nombre)).toEqual(['lock', ...TABLAS]);
    expect(llamadas).toEqual(['lock', ...TABLAS]);
  });

  it('bloquea primero la fila del usuario, igual que el webhook y la fusión', async () => {
    const { prisma, raw } = makePrisma();

    await new PrismaCuentaRepository(prisma).eliminar('user-a');

    const ops = raw.$transaction.mock.calls[0][0] as Array<{
      nombre: string;
      valores?: unknown[];
    }>;
    expect(ops[0]).toEqual({ nombre: 'lock', valores: ['user-a'] });
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
