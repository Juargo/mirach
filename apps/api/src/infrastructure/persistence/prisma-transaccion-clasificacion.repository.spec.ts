import type { Mock } from 'vitest';
import { PrismaTransaccionClasificacionRepository } from './prisma-transaccion-clasificacion.repository';
import { PrismaClient } from '@prisma/client';

/**
 * Unit tests for PrismaTransaccionClasificacionRepository.
 *
 * Verifies:
 *   (a) findMany is called with `where: { ingestaId }` (scope isolation)
 *   (b) correct field mapping (id, descripcion, cargo, abono)
 *   (c) large BigInt amounts round-trip exactly without lossy Number() conversion
 *       (guards the money-type contract — 10_000_000_000_000_000n exceeds JS safe integer)
 */
function makePrismaMock(
  rows: Array<{
    id: string;
    descripcion: string;
    cargo: bigint;
    abono: bigint;
  }>,
) {
  return {
    transaccion: {
      findMany: vi.fn().mockResolvedValue(rows),
    },
  } as unknown as PrismaClient;
}

describe('PrismaTransaccionClasificacionRepository', () => {
  describe('findParaClasificar()', () => {
    it('calls findMany with where: { ingestaId } for scope isolation', async () => {
      const prisma = makePrismaMock([]);
      const repo = new PrismaTransaccionClasificacionRepository(prisma);

      await repo.findParaClasificar('ingesta-abc');

      expect(prisma.transaccion.findMany as Mock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { ingestaId: 'ingesta-abc' } }),
      );
    });

    it('maps rows to correct TransaccionParaClasificar shape', async () => {
      const rows = [
        { id: 'tx-1', descripcion: 'Compra Lider', cargo: 9500n, abono: 0n },
        {
          id: 'tx-2',
          descripcion: 'Sueldo Empresa',
          cargo: 0n,
          abono: 1500000n,
        },
      ];
      const prisma = makePrismaMock(rows);
      const repo = new PrismaTransaccionClasificacionRepository(prisma);

      const result = await repo.findParaClasificar('ingesta-1');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'tx-1',
        descripcion: 'Compra Lider',
        cargo: 9500n,
        abono: 0n,
      });
      expect(result[1]).toEqual({
        id: 'tx-2',
        descripcion: 'Sueldo Empresa',
        cargo: 0n,
        abono: 1500000n,
      });
    });

    it('returns bigint exactly for a large amount (money-type contract — no lossy Number() conversion)', async () => {
      // 10_000_000_000_000_000n exceeds Number.MAX_SAFE_INTEGER (9_007_199_254_740_991)
      // so Number(x) would corrupt it. The field must stay bigint.
      const largeAmount = 10_000_000_000_000_000n;
      const rows = [
        {
          id: 'tx-big',
          descripcion: 'Monto grande',
          cargo: largeAmount,
          abono: 0n,
        },
      ];
      const prisma = makePrismaMock(rows);
      const repo = new PrismaTransaccionClasificacionRepository(prisma);

      const result = await repo.findParaClasificar('ingesta-big');

      expect(result[0].cargo).toBe(largeAmount);
      expect(typeof result[0].cargo).toBe('bigint');
      // Prove the value is exact — if it were Number(), it would differ
      expect(result[0].cargo === largeAmount).toBe(true);
    });

    it('returns empty array when no transactions exist for ingestaId', async () => {
      const prisma = makePrismaMock([]);
      const repo = new PrismaTransaccionClasificacionRepository(prisma);

      const result = await repo.findParaClasificar('ingesta-empty');

      expect(result).toHaveLength(0);
    });
  });
});
