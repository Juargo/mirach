import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { PrismaRegistrarMovimientoManualRepository } from './prisma-registrar-movimiento-manual.repository';
import { ICryptoService } from '../../application/ports/crypto-service.port';
import { IBlindIndexService } from '../../application/ports/blind-index-service.port';
import { Bucket } from '../../domain/value-objects/bucket';
import { Transaccion } from '../../domain/value-objects/transaccion';
import { PersistenciaFallidaError } from '../../domain/errors/persistencia-fallida.error';
import { BUCKET_IDS } from './bucket-ids';
import { normalizeNumeroCuenta } from './normalize-numero-cuenta';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

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

function makeRepo(
  prismaOverride: unknown,
  opts?: {
    cryptoFn?: (v: string) => string;
    blindFn?: (v: string) => string;
  },
): PrismaRegistrarMovimientoManualRepository {
  return new PrismaRegistrarMovimientoManualRepository(
    prismaOverride as PrismaClient,
    makeCrypto(opts?.cryptoFn),
    makeBlindIndex(opts?.blindFn),
  );
}

const FECHA = new Date('2026-08-21T00:00:00.000Z');

function makeTransaccion(cargo = 0n, abono = 50_000n): Transaccion {
  return Transaccion.crear({
    fecha: FECHA,
    descripcion: 'Descripción de prueba',
    cargo,
    abono,
  }).getValue();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PrismaRegistrarMovimientoManualRepository', () => {
  describe('asegurarCuentaManual — sentinel account (D-05)', () => {
    it('hace upsert en la clave compuesta userId_banco_tipoCuenta_numeroCuentaBlindIndex', async () => {
      const upsert = vi.fn().mockResolvedValue({ id: 'acc-sentinel' });
      const repo = makeRepo({ account: { upsert } });

      await repo.asegurarCuentaManual('user-1');

      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_banco_tipoCuenta_numeroCuentaBlindIndex:
              expect.objectContaining({
                userId: 'user-1',
              }),
          },
        }),
      );
    });

    it('usa las constantes del módulo para banco y tipoCuenta (nunca literales inline)', async () => {
      const upsert = vi.fn().mockResolvedValue({ id: 'acc-sentinel' });
      const repo = makeRepo({ account: { upsert } });

      await repo.asegurarCuentaManual('user-1');

      const callArg = upsert.mock.calls[0][0];
      // El sentinel debe usar 'Manual' para banco y tipoCuenta (constantes del módulo)
      expect(
        callArg.where.userId_banco_tipoCuenta_numeroCuentaBlindIndex.banco,
      ).toBe('Manual');
      expect(
        callArg.where.userId_banco_tipoCuenta_numeroCuentaBlindIndex.tipoCuenta,
      ).toBe('Manual');
    });

    it('computa numeroCuentaBlindIndex con normalizeNumeroCuenta(SENTINEL_RAW) — NO puede ser null', async () => {
      const computeSpy = vi.fn((v: string) => `bi:${v}`);
      const upsert = vi.fn().mockResolvedValue({ id: 'acc-sentinel' });
      const repo = makeRepo({ account: { upsert } }, { blindFn: computeSpy });

      await repo.asegurarCuentaManual('user-1');

      // El blind index se computa con el valor normalizado del sentinel raw ('MANUAL')
      expect(computeSpy).toHaveBeenCalledWith(normalizeNumeroCuenta('MANUAL'));
      // El numeroCuentaBlindIndex en el where NO puede ser null (rompe upsert idempotency)
      const callArg = upsert.mock.calls[0][0];
      const blindInWhere =
        callArg.where.userId_banco_tipoCuenta_numeroCuentaBlindIndex
          .numeroCuentaBlindIndex;
      expect(blindInWhere).not.toBeNull();
      expect(blindInWhere).not.toBeUndefined();
      expect(typeof blindInWhere).toBe('string');
    });

    it('dos llamadas devuelven el mismo accountId (idempotencia — mismo where = mismo upsert)', async () => {
      let callCount = 0;
      const upsert = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({ id: 'acc-sentinel' });
      });
      const repo = makeRepo({ account: { upsert } });

      const r1 = await repo.asegurarCuentaManual('user-1');
      const r2 = await repo.asegurarCuentaManual('user-1');

      expect(r1.isOk()).toBe(true);
      expect(r2.isOk()).toBe(true);
      expect(r1.getValue().accountId).toBe('acc-sentinel');
      expect(r2.getValue().accountId).toBe('acc-sentinel');
      // Dos llamadas = dos upserts (el prisma upsert maneja la idempotencia a nivel DB)
      expect(callCount).toBe(2);
    });

    it('el create del upsert cifra numeroCuenta (no en claro)', async () => {
      const upsert = vi.fn().mockResolvedValue({ id: 'acc-sentinel' });
      const repo = makeRepo({ account: { upsert } });

      await repo.asegurarCuentaManual('user-1');

      const callArg = upsert.mock.calls[0][0];
      // La numeroCuenta en create debe estar cifrada (usando crypto.encrypt)
      expect(callArg.create.numeroCuenta).toMatch(/^cifrado:/);
    });

    it('el create del upsert lleva el userId del caller (aislamiento multi-tenant RNF-SEC-006)', async () => {
      const upsert = vi.fn().mockResolvedValue({ id: 'acc-sentinel' });
      const repo = makeRepo({ account: { upsert } });

      await repo.asegurarCuentaManual('user-1');

      const callArg = upsert.mock.calls[0][0];
      expect(callArg.create.userId).toBe('user-1');
    });

    it('devuelve Result.ok con accountId cuando el upsert tiene éxito', async () => {
      const upsert = vi.fn().mockResolvedValue({ id: 'acc-xyz' });
      const repo = makeRepo({ account: { upsert } });

      const result = await repo.asegurarCuentaManual('user-1');

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toEqual({ accountId: 'acc-xyz' });
    });

    it('convierte error de infraestructura en Result.fail(PersistenciaFallidaError)', async () => {
      const upsert = vi.fn().mockRejectedValue(new Error('DB caída'));
      const repo = makeRepo({ account: { upsert } });

      const result = await repo.asegurarCuentaManual('user-1');

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(PersistenciaFallidaError);
    });
  });

  describe('registrar — escritura de la Transaccion (D-08)', () => {
    it('escribe ingestaId: null (nunca un ingestaId)', async () => {
      const create = vi.fn().mockResolvedValue({ id: 'tx-1' });
      const repo = makeRepo({ transaccion: { create } });
      const tx = makeTransaccion(0n, 50_000n);

      await repo.registrar({
        userId: 'user-1',
        accountId: 'acc-sentinel',
        transaccion: tx,
        bucket: Bucket.Ingreso,
        categoriaId: null,
      });

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ ingestaId: null }),
        }),
      );
    });

    it('escribe accountId del caller en data (aislamiento multi-tenant RNF-SEC-006)', async () => {
      const create = vi.fn().mockResolvedValue({ id: 'tx-1' });
      const repo = makeRepo({ transaccion: { create } });
      const tx = makeTransaccion(0n, 50_000n);

      await repo.registrar({
        userId: 'user-1',
        accountId: 'acc-sentinel',
        transaccion: tx,
        bucket: Bucket.Ingreso,
        categoriaId: null,
      });

      const callArg = create.mock.calls[0][0];
      expect(callArg.data).toEqual(
        expect.objectContaining({ accountId: 'acc-sentinel' }),
      );
    });

    it("escribe origen: 'Manual'", async () => {
      const create = vi.fn().mockResolvedValue({ id: 'tx-1' });
      const repo = makeRepo({ transaccion: { create } });
      const tx = makeTransaccion(0n, 50_000n);

      await repo.registrar({
        userId: 'user-1',
        accountId: 'acc-sentinel',
        transaccion: tx,
        bucket: Bucket.Ingreso,
        categoriaId: null,
      });

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ origen: 'Manual' }),
        }),
      );
    });

    it('resuelve bucket → BUCKET_IDS[bucket] (bucketId físico correcto) — Gasto Deseos', async () => {
      const create = vi.fn().mockResolvedValue({ id: 'tx-1' });
      const repo = makeRepo({ transaccion: { create } });
      const tx = makeTransaccion(12_000n, 0n); // Gasto

      await repo.registrar({
        userId: 'user-1',
        accountId: 'acc-sentinel',
        transaccion: tx,
        bucket: Bucket.Deseos,
        categoriaId: 'cat-abc',
      });

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            bucketId: BUCKET_IDS[Bucket.Deseos],
          }),
        }),
      );
    });

    it('resuelve bucket → BUCKET_IDS[bucket] (bucketId físico correcto) — Ingreso', async () => {
      const create = vi.fn().mockResolvedValue({ id: 'tx-2' });
      const repo = makeRepo({ transaccion: { create } });
      const tx = makeTransaccion(0n, 50_000n); // Ingreso

      await repo.registrar({
        userId: 'user-1',
        accountId: 'acc-sentinel',
        transaccion: tx,
        bucket: Bucket.Ingreso,
        categoriaId: null,
      });

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            bucketId: BUCKET_IDS[Bucket.Ingreso],
          }),
        }),
      );
    });

    it('cifra descripcion antes de persistir: llama a crypto.encrypt con el texto plano (ADR-013)', async () => {
      const encryptSpy = vi.fn((v: string) => `enc_${v}_end`);
      const create = vi.fn().mockResolvedValue({ id: 'tx-1' });
      const repo = makeRepo(
        { transaccion: { create } },
        { cryptoFn: encryptSpy },
      );
      const tx = makeTransaccion(0n, 50_000n);

      await repo.registrar({
        userId: 'user-1',
        accountId: 'acc-sentinel',
        transaccion: tx,
        bucket: Bucket.Ingreso,
        categoriaId: null,
      });

      // crypto.encrypt debe haber sido llamado con la descripcion en texto plano
      expect(encryptSpy).toHaveBeenCalledWith('Descripción de prueba');
      // El valor persistido es el resultado de encrypt, no el texto plano directo
      const callArg = create.mock.calls[0][0];
      expect(callArg.data.descripcion).toBe('enc_Descripción de prueba_end');
    });

    it('no llama a Ingesta.create ni createMany (sin historial para movimientos manuales)', async () => {
      const txCreate = vi.fn().mockResolvedValue({ id: 'tx-1' });
      const ingestaCreate = vi.fn();
      const repo = makeRepo({
        transaccion: { create: txCreate },
        ingesta: { create: ingestaCreate, createMany: ingestaCreate },
      });
      const tx = makeTransaccion(0n, 50_000n);

      await repo.registrar({
        userId: 'user-1',
        accountId: 'acc-sentinel',
        transaccion: tx,
        bucket: Bucket.Ingreso,
        categoriaId: null,
      });

      expect(ingestaCreate).not.toHaveBeenCalled();
    });

    it('devuelve Result.ok con el id de la Transaccion creada', async () => {
      const create = vi.fn().mockResolvedValue({ id: 'tx-42' });
      const repo = makeRepo({ transaccion: { create } });
      const tx = makeTransaccion(0n, 50_000n);

      const result = await repo.registrar({
        userId: 'user-1',
        accountId: 'acc-sentinel',
        transaccion: tx,
        bucket: Bucket.Ingreso,
        categoriaId: null,
      });

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toEqual({ id: 'tx-42' });
    });

    it('convierte error de infraestructura en Result.fail(PersistenciaFallidaError)', async () => {
      const create = vi
        .fn()
        .mockRejectedValue(new Error('constraint violation'));
      const repo = makeRepo({ transaccion: { create } });
      const tx = makeTransaccion(0n, 50_000n);

      const result = await repo.registrar({
        userId: 'user-1',
        accountId: 'acc-sentinel',
        transaccion: tx,
        bucket: Bucket.Ingreso,
        categoriaId: null,
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(PersistenciaFallidaError);
    });
  });
});
