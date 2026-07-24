import type { Mock } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { DemoCleanupService } from './demo-cleanup.service';
import { IReloj } from '../../../application/ports/reloj.port';
import { TTL_SESION_MS } from '../../../domain/value-objects/duracion-sesion';

const AHORA = new Date('2026-07-18T12:00:00.000Z');

function makeTxMock() {
  return {
    session: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    transaccion: { deleteMany: vi.fn().mockResolvedValue({ count: 30 }) },
    ingesta: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    account: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    user: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
  };
}

function makePrismaMock(
  findManyResult: Array<{ id: string }>,
  tx: ReturnType<typeof makeTxMock> = makeTxMock(),
) {
  return {
    user: { findMany: vi.fn().mockResolvedValue(findManyResult) },
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(tx)),
  } as unknown as PrismaClient;
}

function makeReloj(): IReloj {
  return { ahora: vi.fn().mockReturnValue(AHORA) };
}

describe('DemoCleanupService.borrarExpirados() (DEMO-CLN-01/02)', () => {
  it('sin demos expirados → retorna 0 y NO abre ninguna transacción', async () => {
    const prisma = makePrismaMock([]);
    const service = new DemoCleanupService(prisma, makeReloj());

    const count = await service.borrarExpirados();

    expect(count).toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('consulta usuarios demo con demoCreatedAt anterior al cutoff (ahora - TTL)', async () => {
    const prisma = makePrismaMock([]);
    const service = new DemoCleanupService(prisma, makeReloj());

    await service.borrarExpirados();

    const cutoffEsperado = new Date(AHORA.getTime() - TTL_SESION_MS);
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { esDemo: true, demoCreatedAt: { lt: cutoffEsperado } },
      select: { id: true },
    });
  });

  it('con demos expirados → borra en cascada Session→Transaccion→Ingesta→Account→User, en ese orden', async () => {
    const tx = makeTxMock();
    const prisma = makePrismaMock([{ id: 'user-demo-1' }, { id: 'user-demo-2' }], tx);
    const service = new DemoCleanupService(prisma, makeReloj());

    const llamadas: string[] = [];
    tx.session.deleteMany.mockImplementation(async () => {
      llamadas.push('session');
      return { count: 1 };
    });
    tx.transaccion.deleteMany.mockImplementation(async () => {
      llamadas.push('transaccion');
      return { count: 60 };
    });
    tx.ingesta.deleteMany.mockImplementation(async () => {
      llamadas.push('ingesta');
      return { count: 2 };
    });
    tx.account.deleteMany.mockImplementation(async () => {
      llamadas.push('account');
      return { count: 2 };
    });
    tx.user.deleteMany.mockImplementation(async () => {
      llamadas.push('user');
      return { count: 2 };
    });

    const count = await service.borrarExpirados();

    expect(llamadas).toEqual(['session', 'transaccion', 'ingesta', 'account', 'user']);
    expect(count).toBe(2);
    const ids = ['user-demo-1', 'user-demo-2'];
    expect(tx.session.deleteMany).toHaveBeenCalledWith({ where: { userId: { in: ids } } });
    expect(tx.account.deleteMany).toHaveBeenCalledWith({ where: { userId: { in: ids } } });
    expect(tx.user.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ids } } });
  });
});

describe('DemoCleanupService.limpiarDiario() (DEMO-CLN-03)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sin demos expirados → loguea "0 expired demo accounts cleaned"', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const prisma = makePrismaMock([]);
    const service = new DemoCleanupService(prisma, makeReloj());

    await service.limpiarDiario();

    expect(logSpy).toHaveBeenCalledWith('0 expired demo accounts cleaned');
  });

  it('con demos expirados → loguea la cantidad borrada', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const tx = makeTxMock();
    tx.user.deleteMany.mockResolvedValue({ count: 1 });
    const prisma = makePrismaMock([{ id: 'user-demo-1' }], tx);
    const service = new DemoCleanupService(prisma, makeReloj());

    await service.limpiarDiario();

    expect(logSpy).toHaveBeenCalledWith('1 expired demo accounts cleaned');
  });

  it('nunca lanza: un fallo de infraestructura se loguea como error, no se propaga', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const prisma = {
      user: { findMany: vi.fn().mockRejectedValue(new Error('DB connection lost')) },
      $transaction: vi.fn(),
    } as unknown as PrismaClient;
    const service = new DemoCleanupService(prisma, makeReloj());

    await expect(service.limpiarDiario()).resolves.toBeUndefined();
    expect(errorSpy as Mock).toHaveBeenCalled();
  });
});
