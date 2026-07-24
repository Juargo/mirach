import { EstadoIngesta } from '@prisma/client';
import { PrismaDemoRepository } from './prisma-demo.repository';
import { PrismaClient } from '@prisma/client';
import { IReloj } from '../../application/ports/reloj.port';
import { DEMO_TRANSACCIONES } from './demo-data';

const AHORA = new Date('2026-07-18T12:00:00.000Z');
const TOKEN_HASH = 'hash-demo-abc';
const EXPIRES_AT = new Date('2026-07-25T12:00:00.000Z');

function makeTxMock() {
  return {
    user: { create: vi.fn().mockResolvedValue({ id: 'user-demo-1' }) },
    account: { create: vi.fn().mockResolvedValue({ id: 'account-demo-1' }) },
    ingesta: { create: vi.fn().mockResolvedValue({ id: 'ingesta-demo-1' }) },
    transaccion: { createMany: vi.fn().mockResolvedValue({ count: DEMO_TRANSACCIONES.length }) },
    session: { create: vi.fn().mockResolvedValue({ id: 'session-demo-1' }) },
  };
}

function makePrismaMock(tx: ReturnType<typeof makeTxMock>) {
  return {
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(tx)),
  } as unknown as PrismaClient;
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

    const result = await repo.crear({
      nombre: 'Demo-abc123',
      tokenHash: TOKEN_HASH,
      expiresAt: EXPIRES_AT,
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ userId: 'user-demo-1', accountId: 'account-demo-1' });
  });

  it('crea el User con esDemo=true, demoCreatedAt=ahora y el nombre recibido', async () => {
    const tx = makeTxMock();
    const prisma = makePrismaMock(tx);
    const repo = new PrismaDemoRepository(prisma, makeReloj());

    await repo.crear({ nombre: 'Demo-abc123', tokenHash: TOKEN_HASH, expiresAt: EXPIRES_AT });

    expect(tx.user.create).toHaveBeenCalledWith({
      data: { nombre: 'Demo-abc123', esDemo: true, demoCreatedAt: AHORA },
    });
  });

  it('crea el Account referenciando el userId recién creado', async () => {
    const tx = makeTxMock();
    const prisma = makePrismaMock(tx);
    const repo = new PrismaDemoRepository(prisma, makeReloj());

    await repo.crear({ nombre: 'Demo-abc123', tokenHash: TOKEN_HASH, expiresAt: EXPIRES_AT });

    expect(tx.account.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'user-demo-1' }) }),
    );
  });

  it('crea la Ingesta PROCESADA referenciando el accountId recién creado', async () => {
    const tx = makeTxMock();
    const prisma = makePrismaMock(tx);
    const repo = new PrismaDemoRepository(prisma, makeReloj());

    await repo.crear({ nombre: 'Demo-abc123', tokenHash: TOKEN_HASH, expiresAt: EXPIRES_AT });

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

    await repo.crear({ nombre: 'Demo-abc123', tokenHash: TOKEN_HASH, expiresAt: EXPIRES_AT });

    expect(tx.transaccion.createMany).toHaveBeenCalledTimes(1);
    const [{ data }] = (tx.transaccion.createMany as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(data).toHaveLength(DEMO_TRANSACCIONES.length);
    for (const row of data) {
      expect(row.accountId).toBe('account-demo-1');
      expect(row.ingestaId).toBe('ingesta-demo-1');
    }
  });

  it('crea la Session DENTRO de la misma $transaction, con el userId recién creado y el tokenHash/expiresAt recibidos (fix crítico DEMO-DATA-04 — no orphan)', async () => {
    const tx = makeTxMock();
    const prisma = makePrismaMock(tx);
    const repo = new PrismaDemoRepository(prisma, makeReloj());

    await repo.crear({ nombre: 'Demo-abc123', tokenHash: TOKEN_HASH, expiresAt: EXPIRES_AT });

    expect(tx.session.create).toHaveBeenCalledWith({
      data: { userId: 'user-demo-1', tokenHash: TOKEN_HASH, expiresAt: EXPIRES_AT },
    });
  });

  it('si el insert de la Session falla, TODA la transacción rechaza — el usuario demo no queda huérfano (rollback, no compensación separada)', async () => {
    const tx = makeTxMock();
    tx.session.create.mockRejectedValue(new Error('DB connection lost'));
    const prisma = makePrismaMock(tx);
    const repo = new PrismaDemoRepository(prisma, makeReloj());

    await expect(
      repo.crear({ nombre: 'Demo-abc123', tokenHash: TOKEN_HASH, expiresAt: EXPIRES_AT }),
    ).rejects.toThrow('DB connection lost');
  });
});
