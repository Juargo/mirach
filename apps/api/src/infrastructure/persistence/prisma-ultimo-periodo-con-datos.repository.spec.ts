import { PrismaUltimoPeriodoConDatosReader } from './prisma-ultimo-periodo-con-datos.repository';
import { PrismaClient } from '@prisma/client';

/**
 * Unit tests for PrismaUltimoPeriodoConDatosReader — mocked PrismaClient
 * (issue #747). DB-backed scenarios (real user isolation, real rows) are
 * covered by the deferred int-spec suite
 * (ultimo-periodo-con-datos.int-spec.ts).
 */
describe('PrismaUltimoPeriodoConDatosReader', () => {
  it('usuario sin ninguna transacción → null', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const prisma = { transaccion: { findFirst } } as unknown as PrismaClient;
    const repo = new PrismaUltimoPeriodoConDatosReader(prisma);

    const result = await repo.ultimoPeriodoConDatos('user-1');

    expect(result).toBeNull();
  });

  it('deriva YYYY-MM UTC de la fecha de la transacción más reciente', async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValue({ fecha: new Date('2026-03-15T23:59:59.999Z') });
    const prisma = { transaccion: { findFirst } } as unknown as PrismaClient;
    const repo = new PrismaUltimoPeriodoConDatosReader(prisma);

    const result = await repo.ultimoPeriodoConDatos('user-1');

    expect(result?.valor).toBe('2026-03');
  });

  it('fecha de fin de año UTC deriva el año/mes correctos (sin off-by-one de timezone)', async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValue({ fecha: new Date('2025-12-31T23:59:59.999Z') });
    const prisma = { transaccion: { findFirst } } as unknown as PrismaClient;
    const repo = new PrismaUltimoPeriodoConDatosReader(prisma);

    const result = await repo.ultimoPeriodoConDatos('user-1');

    expect(result?.valor).toBe('2025-12');
  });

  it('fecha de inicio de año UTC (00:00:00.000Z) deriva el año/mes correctos', async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValue({ fecha: new Date('2026-01-01T00:00:00.000Z') });
    const prisma = { transaccion: { findFirst } } as unknown as PrismaClient;
    const repo = new PrismaUltimoPeriodoConDatosReader(prisma);

    const result = await repo.ultimoPeriodoConDatos('user-1');

    expect(result?.valor).toBe('2026-01');
  });

  it('user isolation: filtra estructuralmente por account.userId (RNF-SEC-006)', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const prisma = { transaccion: { findFirst } } as unknown as PrismaClient;
    const repo = new PrismaUltimoPeriodoConDatosReader(prisma);

    await repo.ultimoPeriodoConDatos('user-abc');

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { account: { userId: 'user-abc' } },
      }),
    );
  });

  it('ordena por fecha desc para obtener la transacción más reciente', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const prisma = { transaccion: { findFirst } } as unknown as PrismaClient;
    const repo = new PrismaUltimoPeriodoConDatosReader(prisma);

    await repo.ultimoPeriodoConDatos('user-1');

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { fecha: 'desc' } }),
    );
  });
});
