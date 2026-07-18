import { EstadoIngesta } from '@prisma/client';
import { PrismaDemoRepository } from './prisma-demo.repository';
import { PrismaService } from './prisma.service';
import { IReloj } from '../../application/ports/reloj.port';
import { DEMO_TRANSACCIONES } from '../../../prisma/demo-data';

const AHORA = new Date('2026-07-18T12:00:00.000Z');

function makeTxMock() {
  return {
    user: { create: vi.fn().mockResolvedValue({ id: 'user-demo-1' }) },
    account: { create: vi.fn().mockResolvedValue({ id: 'account-demo-1' }) },
    ingesta: { create: vi.fn().mockResolvedValue({ id: 'ingesta-demo-1' }) },
    transaccion: { createMany: vi.fn().mockResolvedValue({ count: DEMO_TRANSACCIONES.length }) },
  };
}

function makePrismaMock(tx: ReturnType<typeof makeTxMock>) {
  return {
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(tx)),
  } as unknown as PrismaService;
}

function makeReloj(): IReloj {
  return { ahora: vi.fn().mockReturnValue(AHORA) };
}

describe('PrismaDemoRepository', () => {
  it('crea User+Account+Ingesta+Transacciones dentro de una única $transaction (DEMO-DATA-04)', async () => {
    const tx = makeTxMock();
    const prisma = makePrismaMock(tx);
    const reloj = makeReloj();
    const repo = new PrismaDemoRepository(prisma, reloj);

    const result = await repo.crear({ nombre: 'Demo-abc123' });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ userId: 'user-demo-1', accountId: 'account-demo-1' });
  });

  it('crea el User con esDemo=true, demoCreatedAt=ahora y el nombre recibido', async () => {
    const tx = makeTxMock();
    const prisma = makePrismaMock(tx);
    const repo = new PrismaDemoRepository(prisma, makeReloj());

    await repo.crear({ nombre: 'Demo-abc123' });

    expect(tx.user.create).toHaveBeenCalledWith({
      data: { nombre: 'Demo-abc123', esDemo: true, demoCreatedAt: AHORA },
    });
  });

  it('crea el Account referenciando el userId recién creado', async () => {
    const tx = makeTxMock();
    const prisma = makePrismaMock(tx);
    const repo = new PrismaDemoRepository(prisma, makeReloj());

    await repo.crear({ nombre: 'Demo-abc123' });

    expect(tx.account.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'user-demo-1' }) }),
    );
  });

  it('crea la Ingesta PROCESADA referenciando el accountId recién creado', async () => {
    const tx = makeTxMock();
    const prisma = makePrismaMock(tx);
    const repo = new PrismaDemoRepository(prisma, makeReloj());

    await repo.crear({ nombre: 'Demo-abc123' });

    expect(tx.ingesta.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountId: 'account-demo-1',
          estado: EstadoIngesta.PROCESADA,
          totalTransacciones: DEMO_TRANSACCIONES.length,
        }),
      }),
    );
  });

  it('inserta todas las transacciones demo vía createMany, con accountId/ingestaId correctos', async () => {
    const tx = makeTxMock();
    const prisma = makePrismaMock(tx);
    const repo = new PrismaDemoRepository(prisma, makeReloj());

    await repo.crear({ nombre: 'Demo-abc123' });

    expect(tx.transaccion.createMany).toHaveBeenCalledTimes(1);
    const [{ data }] = (tx.transaccion.createMany as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(data).toHaveLength(DEMO_TRANSACCIONES.length);
    for (const row of data) {
      expect(row.accountId).toBe('account-demo-1');
      expect(row.ingestaId).toBe('ingesta-demo-1');
    }
  });
});
