import type { Mock } from 'vitest';
import { PrismaIngestaRepository } from './prisma-ingesta.repository';
import { PrismaClient } from '@prisma/client';
import { ICryptoService } from '../../application/ports/crypto-service.port';
import { Transaccion } from '../../domain/value-objects/transaccion';
import { PersistenciaFallidaError } from '../../domain/errors/persistencia-fallida.error';

/**
 * Unit tests for PrismaIngestaRepository.persistirProcesada — mocked
 * PrismaClient (US-004, design.md §7.1). El ciclo de vida COLAPSA a una
 * única escritura atómica: un `ingesta.create` con `transacciones:
 * { createMany: {...} }` anidado (un solo statement, una sola transacción
 * implícita de Postgres) — reemplaza el trío
 * createPending/commit/markFailed (Slice previo de US-018/US-005).
 */
describe('PrismaIngestaRepository.persistirProcesada (US-004)', () => {
  function makeCrypto(): ICryptoService {
    return { encrypt: (v: string) => `enc(${v})`, decrypt: (v: string) => v };
  }

  const TXS: Transaccion[] = [
    Transaccion.crear({
      fecha: new Date('2026-07-10T00:00:00.000Z'),
      descripcion: 'Compra',
      cargo: 5000n,
      abono: 0n,
    }).getValue(),
    Transaccion.crear({
      fecha: new Date('2026-07-11T00:00:00.000Z'),
      descripcion: 'Sueldo',
      cargo: 0n,
      abono: 900000n,
    }).getValue(),
  ];

  const baseInput = {
    userId: 'user-1',
    accountId: 'acc-1',
    banco: 'BancoEstado',
    nombreArchivo: 'movimientos.xlsx',
    transacciones: TXS,
    duplicadosOmitidos: 2,
  };

  it('crea la Ingesta PROCESADA con la transacciones anidadas vía createMany (nested write, un solo create)', async () => {
    const create: Mock = vi.fn().mockResolvedValue({ id: 'ingesta-1' });
    const prisma = { ingesta: { create } } as unknown as PrismaClient;
    const repo = new PrismaIngestaRepository(prisma, makeCrypto());

    const result = await repo.persistirProcesada(baseInput);

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual({ ingestaId: 'ingesta-1', total: 2 });
    expect(create).toHaveBeenCalledTimes(1);

    const [{ data }] = create.mock.calls[0];
    expect(data).toMatchObject({
      userId: 'user-1',
      accountId: 'acc-1',
      banco: 'BancoEstado',
      nombreArchivo: 'movimientos.xlsx',
      estado: 'PROCESADA',
      totalTransacciones: 2,
      duplicadosOmitidos: 2,
    });
    expect(data.procesadoEn).toBeInstanceOf(Date);
  });

  it('mapea cada transacción vía aPersistencia (descripción cifrada) + accountId propio, dentro de transacciones.createMany.data', async () => {
    const create: Mock = vi.fn().mockResolvedValue({ id: 'ingesta-1' });
    const prisma = { ingesta: { create } } as unknown as PrismaClient;
    const crypto = makeCrypto();
    const repo = new PrismaIngestaRepository(prisma, crypto);

    await repo.persistirProcesada(baseInput);

    const [{ data }] = create.mock.calls[0];
    const createManyData = data.transacciones.createMany.data;
    expect(createManyData).toHaveLength(2);
    expect(createManyData[0]).toMatchObject({
      descripcion: 'enc(Compra)',
      cargo: 5000n,
      abono: 0n,
      accountId: 'acc-1',
      bucketId: null,
    });
    expect(createManyData[1]).toMatchObject({
      descripcion: 'enc(Sueldo)',
      cargo: 0n,
      abono: 900000n,
      accountId: 'acc-1',
    });
  });

  it('lista vacía: totalTransacciones=0, createMany.data=[]', async () => {
    const create: Mock = vi.fn().mockResolvedValue({ id: 'ingesta-1' });
    const prisma = { ingesta: { create } } as unknown as PrismaClient;
    const repo = new PrismaIngestaRepository(prisma, makeCrypto());

    const result = await repo.persistirProcesada({
      ...baseInput,
      transacciones: [],
    });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().total).toBe(0);
    const [{ data }] = create.mock.calls[0];
    expect(data.totalTransacciones).toBe(0);
    expect(data.transacciones.createMany.data).toEqual([]);
  });

  it('el create rechaza (p. ej. CHECK/constraint violation): retorna Result.fail(PersistenciaFallidaError), nunca lanza', async () => {
    const create: Mock = vi
      .fn()
      .mockRejectedValue(new Error('constraint violation'));
    const prisma = { ingesta: { create } } as unknown as PrismaClient;
    const repo = new PrismaIngestaRepository(prisma, makeCrypto());

    const result = await repo.persistirProcesada(baseInput);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PersistenciaFallidaError);
  });
});
