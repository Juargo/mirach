import type { Mock } from 'vitest';
import { PrismaIngestaRepository } from './prisma-ingesta.repository';
import { PrismaClient } from '@prisma/client';
import { ICryptoService } from '../../application/ports/crypto-service.port';
import { Transaccion } from '../../domain/value-objects/transaccion';
import { PersistenciaFallidaError } from '../../domain/errors/persistencia-fallida.error';

/**
 * Unit tests for PrismaIngestaRepository.commit — mocked PrismaClient
 * (US-005, Slice 2). Verifica que `duplicadosOmitidos` se escriba dentro del
 * MISMO `$transaction([...])` que ya transiciona la Ingesta a PROCESADA (no
 * una segunda escritura no-atómica). El resto del ciclo de vida
 * (createPending/markFailed) ya está cubierto end-to-end por
 * PersistTransactionsUseCase.spec.ts + el e2e HTTP; este spec solo cubre lo
 * NUEVO de US-005.
 */
describe('PrismaIngestaRepository.commit — duplicadosOmitidos (US-005)', () => {
  function makeCrypto(): ICryptoService {
    return { encrypt: (v: string) => v, decrypt: (v: string) => v };
  }

  const TXS: Transaccion[] = [
    Transaccion.crear({
      fecha: new Date('2026-07-10T00:00:00.000Z'),
      descripcion: 'Compra',
      cargo: 5000n,
      abono: 0n,
    }).getValue(),
  ];

  it('escribe duplicadosOmitidos en el data del ingesta.update dentro del MISMO $transaction([...])', async () => {
    const transaction: Mock = vi.fn().mockResolvedValue(undefined);
    const createMany = vi.fn();
    const update = vi.fn();
    const prisma = {
      transaccion: { createMany },
      ingesta: { update },
      $transaction: transaction,
    } as unknown as PrismaClient;
    const repo = new PrismaIngestaRepository(prisma, makeCrypto());

    await repo.commit('ingesta-1', 'acc-1', TXS, 3);

    expect(transaction).toHaveBeenCalledTimes(1);
    const opsPassed = transaction.mock.calls[0][0] as unknown[];
    expect(opsPassed).toHaveLength(2);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'ingesta-1' },
      data: expect.objectContaining({
        estado: 'PROCESADA',
        totalTransacciones: TXS.length,
        duplicadosOmitidos: 3,
        procesadoEn: expect.any(Date),
      }),
    });
  });

  it('duplicadosOmitidos: 0 se escribe igual (no se omite el campo)', async () => {
    const transaction: Mock = vi.fn().mockResolvedValue(undefined);
    const update = vi.fn();
    const prisma = {
      transaccion: { createMany: vi.fn() },
      ingesta: { update },
      $transaction: transaction,
    } as unknown as PrismaClient;
    const repo = new PrismaIngestaRepository(prisma, makeCrypto());

    await repo.commit('ingesta-1', 'acc-1', TXS, 0);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ duplicadosOmitidos: 0 }),
      }),
    );
  });

  it('$transaction falla: retorna Result.fail(PersistenciaFallidaError), nunca lanza', async () => {
    const transaction: Mock = vi.fn().mockRejectedValue(new Error('rollback'));
    const prisma = {
      transaccion: { createMany: vi.fn() },
      ingesta: { update: vi.fn() },
      $transaction: transaction,
    } as unknown as PrismaClient;
    const repo = new PrismaIngestaRepository(prisma, makeCrypto());

    const result = await repo.commit('ingesta-1', 'acc-1', TXS, 3);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PersistenciaFallidaError);
  });
});
