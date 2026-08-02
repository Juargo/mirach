import type { Mock } from 'vitest';
import { PrismaAccountRepository } from './prisma-account.repository';
import { PrismaClient } from '@prisma/client';
import { DetectedBank } from '../../application/ports/bank-detector.port';
import { ICryptoService } from '../../application/ports/crypto-service.port';
import { IBlindIndexService } from '../../application/ports/blind-index-service.port';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { TipoCuentaConocido } from '../../domain/value-objects/tipo-cuenta';

function makeCrypto(encryptFn?: (v: string) => string): ICryptoService {
  return {
    encrypt: encryptFn ?? ((v: string) => `cifrado:${v}`),
    decrypt: (v: string) => v,
  };
}

function makeBlindIndex(computeFn?: (v: string) => string): IBlindIndexService {
  return {
    compute: computeFn ?? ((v: string) => `bi:${v}`),
  };
}

const BANCO: DetectedBank = {
  banco: BancoConocido.BCI,
  tipoCuenta: TipoCuentaConocido.CuentaCorriente,
  numeroCuenta: '  12345-6  ',
};

/**
 * Unit tests for PrismaAccountRepository (US-035 Slice 2) — mocked
 * PrismaClient, fake crypto/blindIndex. Covers: `ensure()` normalizes
 * numeroCuenta (`.trim()`) before computing the blind index, upserts by the
 * NEW composite key (userId, banco, tipoCuenta, numeroCuentaBlindIndex), and
 * `create` persists numeroCuenta CIPHERED (never plaintext) plus the blind
 * index. DB-backed idempotency (a repeated ensure() finds the same row) is
 * covered by the deferred int-spec suite.
 */
describe('PrismaAccountRepository', () => {
  it('normaliza numeroCuenta (.trim()) antes de computar el blind index', async () => {
    const computeSpy = vi.fn((v: string) => `bi:${v}`);
    const upsert = vi.fn().mockResolvedValue({ id: 'acc-1' });
    const prisma = { account: { upsert } } as unknown as PrismaClient;
    const repo = new PrismaAccountRepository(
      prisma,
      makeCrypto(),
      makeBlindIndex(computeSpy),
    );

    await repo.ensure('user-1', BANCO);

    expect(computeSpy).toHaveBeenCalledWith('12345-6');
  });

  it('busca (where) por la clave compuesta userId_banco_tipoCuenta_numeroCuentaBlindIndex', async () => {
    const upsert = vi.fn().mockResolvedValue({ id: 'acc-1' });
    const prisma = { account: { upsert } } as unknown as PrismaClient;
    const repo = new PrismaAccountRepository(
      prisma,
      makeCrypto(),
      makeBlindIndex(),
    );

    await repo.ensure('user-1', BANCO);

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_banco_tipoCuenta_numeroCuentaBlindIndex: {
            userId: 'user-1',
            banco: BANCO.banco,
            tipoCuenta: BANCO.tipoCuenta,
            numeroCuentaBlindIndex: 'bi:12345-6',
          },
        },
      }),
    );
  });

  it('create() persiste numeroCuenta CIFRADO (nunca en claro) + el blind index', async () => {
    const upsert = vi.fn().mockResolvedValue({ id: 'acc-1' });
    const prisma = { account: { upsert } } as unknown as PrismaClient;
    const repo = new PrismaAccountRepository(
      prisma,
      makeCrypto(),
      makeBlindIndex(),
    );

    await repo.ensure('user-1', BANCO);

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: {
          userId: 'user-1',
          banco: BANCO.banco,
          tipoCuenta: BANCO.tipoCuenta,
          numeroCuenta: 'cifrado:12345-6',
          numeroCuentaBlindIndex: 'bi:12345-6',
        },
      }),
    );
  });

  it('update queda vacío ({}) — ensure() nunca sobrescribe una cuenta existente', async () => {
    const upsert = vi.fn().mockResolvedValue({ id: 'acc-1' });
    const prisma = { account: { upsert } } as unknown as PrismaClient;
    const repo = new PrismaAccountRepository(
      prisma,
      makeCrypto(),
      makeBlindIndex(),
    );

    await repo.ensure('user-1', BANCO);

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: {} }),
    );
  });

  it('devuelve Result.ok con el accountId cuando el upsert tiene éxito', async () => {
    const upsert = vi.fn().mockResolvedValue({ id: 'acc-42' });
    const prisma = { account: { upsert } } as unknown as PrismaClient;
    const repo = new PrismaAccountRepository(
      prisma,
      makeCrypto(),
      makeBlindIndex(),
    );

    const result = await repo.ensure('user-1', BANCO);

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual({ accountId: 'acc-42' });
  });

  it('convierte un error de infraestructura en Result.fail(PersistenciaFallidaError)', async () => {
    const upsert = vi.fn().mockRejectedValue(new Error('conexión perdida'));
    const prisma = { account: { upsert } } as unknown as PrismaClient;
    const repo = new PrismaAccountRepository(
      prisma,
      makeCrypto(),
      makeBlindIndex(),
    );

    const result = await repo.ensure('user-1', BANCO);

    expect(result.isOk()).toBe(false);
    expect(upsert as Mock).toHaveBeenCalledTimes(1);
  });
});
