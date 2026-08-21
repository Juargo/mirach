import { PrismaAccountReader } from './prisma-account-reader.repository';
import { PrismaClient } from '@prisma/client';
import { PersistenciaFallidaError } from '../../domain/errors/persistencia-fallida.error';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { TipoCuentaConocido } from '../../domain/value-objects/tipo-cuenta';
import { DetectedBank } from '../../application/ports/bank-detector.port';
import { IBlindIndexService } from '../../application/ports/blind-index-service.port';

const BANCO: DetectedBank = {
  banco: BancoConocido.BancoEstado,
  tipoCuenta: TipoCuentaConocido.CuentaRut,
  numeroCuenta: '  111222333  ', // with whitespace to test normalizeNumeroCuenta
};

const BANCO_CLEAN: DetectedBank = {
  ...BANCO,
  numeroCuenta: '111222333',
};

function makeBlindIndex(fn?: (v: string) => string): IBlindIndexService {
  return { compute: fn ?? ((v: string) => `blind:${v}`) };
}

describe('PrismaAccountReader', () => {
  it('llama findUnique con la clave compuesta correcta (userId, banco, tipoCuenta, numeroCuentaBlindIndex)', async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: 'acc-123' });
    const prisma = { account: { findUnique } } as unknown as PrismaClient;
    const blindIndex = makeBlindIndex();
    const reader = new PrismaAccountReader(prisma, blindIndex);

    const result = await reader.findByBanco('user-1', BANCO_CLEAN);

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual({ accountId: 'acc-123' });
    expect(findUnique).toHaveBeenCalledWith({
      where: {
        userId_banco_tipoCuenta_numeroCuentaBlindIndex: {
          userId: 'user-1',
          banco: BancoConocido.BancoEstado,
          tipoCuenta: TipoCuentaConocido.CuentaRut,
          numeroCuentaBlindIndex: 'blind:111222333',
        },
      },
      select: { id: true },
    });
  });

  it('normaliza el numeroCuenta antes de computar el blind index (trim solamente)', async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const prisma = { account: { findUnique } } as unknown as PrismaClient;
    const computeSpy = vi.fn((v: string) => `blind:${v}`);
    const reader = new PrismaAccountReader(prisma, { compute: computeSpy });

    await reader.findByBanco('user-1', BANCO); // numeroCuenta has surrounding spaces

    // normalizeNumeroCuenta = trim: '  111222333  ' → '111222333'
    expect(computeSpy).toHaveBeenCalledWith('111222333');
  });

  it('NO lowercasea el numeroCuenta: la caja se preserva (normalizeNumeroCuenta = trim only)', async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const prisma = { account: { findUnique } } as unknown as PrismaClient;
    const computeSpy = vi.fn((v: string) => `blind:${v}`);
    const reader = new PrismaAccountReader(prisma, { compute: computeSpy });

    await reader.findByBanco('user-1', {
      ...BANCO_CLEAN,
      numeroCuenta: 'ABC123',
    });

    // Chilean account numbers are case-sensitive — normalizeNumeroCuenta must
    // NOT lowercase (unlike email). 'ABC123' reaches compute verbatim.
    expect(computeSpy).toHaveBeenCalledWith('ABC123');
  });

  it('retorna Result.ok(null) cuando la cuenta no existe (findUnique retorna null)', async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const prisma = { account: { findUnique } } as unknown as PrismaClient;
    const reader = new PrismaAccountReader(prisma, makeBlindIndex());

    const result = await reader.findByBanco('user-1', BANCO_CLEAN);

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toBeNull();
  });

  it('retorna Result.fail(PersistenciaFallidaError) cuando Prisma lanza', async () => {
    const findUnique = vi
      .fn()
      .mockRejectedValue(new Error('DB connection lost'));
    const prisma = { account: { findUnique } } as unknown as PrismaClient;
    const reader = new PrismaAccountReader(prisma, makeBlindIndex());

    const result = await reader.findByBanco('user-1', BANCO_CLEAN);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PersistenciaFallidaError);
  });

  it('NUNCA llama account.upsert en ningún path (read-only by construction)', async () => {
    const upsert = vi.fn();
    const findUnique = vi.fn().mockResolvedValue({ id: 'acc-1' });
    const prisma = {
      account: { findUnique, upsert },
    } as unknown as PrismaClient;
    const reader = new PrismaAccountReader(prisma, makeBlindIndex());

    await reader.findByBanco('user-1', BANCO_CLEAN);

    expect(upsert).not.toHaveBeenCalled();
  });
});
