import type { Mock } from 'vitest';
import { PrismaReevaluarCategoriasReader } from './prisma-reevaluar-categorias.reader';
import { PrismaClient } from '@prisma/client';
import { ICryptoService } from '../../application/ports/crypto-service.port';
import { Bucket } from '../../domain/value-objects/bucket';
import { BUCKET_IDS } from './bucket-ids';

/**
 * Unit tests for PrismaReevaluarCategoriasReader.
 *
 * Verifica:
 *   (a) findMany se llama con `where: { account: { userId } }` (RNF-SEC-006,
 *       aislamiento estructural — TODAS las transacciones del usuario, sin
 *       filtro por categoriaId ni por período).
 *   (b) mapeo correcto de campos, incluido el fold de `bucketId` físico →
 *       `Bucket` de dominio (null → SinCategoria).
 *   (c) `descripcion` se descifra vía `crypto.decrypt()` (ADR-013) — mismo
 *       motivo que `PrismaTransaccionClasificacionRepository`.
 *   (d) montos BigInt viajan exactos, sin conversión a `Number`.
 */
function makePrismaMock(
  rows: Array<{
    id: string;
    descripcion: string;
    cargo: bigint;
    abono: bigint;
    categoriaId: string | null;
    bucketId: string | null;
  }>,
) {
  return {
    transaccion: {
      findMany: vi.fn().mockResolvedValue(rows),
    },
  } as unknown as PrismaClient;
}

function makeCrypto(decryptFn?: (v: string) => string): ICryptoService {
  return {
    encrypt: (v: string) => v,
    decrypt: decryptFn ?? ((v: string) => v),
  };
}

describe('PrismaReevaluarCategoriasReader', () => {
  it('RNF-SEC-006: llama a findMany con where: { account: { userId } } — estructural, sin filtro en memoria', async () => {
    const prisma = makePrismaMock([]);
    const reader = new PrismaReevaluarCategoriasReader(prisma, makeCrypto());

    await reader.findTodasDelUsuario('user-a');

    expect(prisma.transaccion.findMany as Mock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { account: { userId: 'user-a' } } }),
    );
  });

  it('mapea categoriaId=null y bucketId=null a { categoriaIdActual: null, bucketActual: SinCategoria }', async () => {
    const rows = [
      {
        id: 'tx-1',
        descripcion: 'compra',
        cargo: 1000n,
        abono: 0n,
        categoriaId: null,
        bucketId: null,
      },
    ];
    const prisma = makePrismaMock(rows);
    const reader = new PrismaReevaluarCategoriasReader(prisma, makeCrypto());

    const result = await reader.findTodasDelUsuario('user-a');

    expect(result[0]).toEqual({
      id: 'tx-1',
      descripcion: 'compra',
      cargo: 1000n,
      abono: 0n,
      categoriaIdActual: null,
      bucketActual: Bucket.SinCategoria,
    });
  });

  it('resuelve un bucketId físico no nulo a su Bucket de dominio', async () => {
    const rows = [
      {
        id: 'tx-2',
        descripcion: 'compra',
        cargo: 1000n,
        abono: 0n,
        categoriaId: 'cat-1',
        bucketId: BUCKET_IDS[Bucket.Necesidades],
      },
    ];
    const prisma = makePrismaMock(rows);
    const reader = new PrismaReevaluarCategoriasReader(prisma, makeCrypto());

    const result = await reader.findTodasDelUsuario('user-a');

    expect(result[0].categoriaIdActual).toBe('cat-1');
    expect(result[0].bucketActual).toBe(Bucket.Necesidades);
  });

  it('ADR-013: descripcion pasa por crypto.decrypt() antes de devolverse', async () => {
    const rows = [
      {
        id: 'tx-1',
        descripcion: 'cifrado-xyz',
        cargo: 1000n,
        abono: 0n,
        categoriaId: null,
        bucketId: null,
      },
    ];
    const prisma = makePrismaMock(rows);
    const crypto = makeCrypto((v) => `plano:${v}`);
    const reader = new PrismaReevaluarCategoriasReader(prisma, crypto);

    const result = await reader.findTodasDelUsuario('user-a');

    expect(result[0].descripcion).toBe('plano:cifrado-xyz');
  });

  it('un monto grande (> Number.MAX_SAFE_INTEGER) viaja exacto como bigint', async () => {
    const largeAmount = 10_000_000_000_000_000n;
    const rows = [
      {
        id: 'tx-big',
        descripcion: 'monto grande',
        cargo: largeAmount,
        abono: 0n,
        categoriaId: null,
        bucketId: null,
      },
    ];
    const prisma = makePrismaMock(rows);
    const reader = new PrismaReevaluarCategoriasReader(prisma, makeCrypto());

    const result = await reader.findTodasDelUsuario('user-a');

    expect(result[0].cargo).toBe(largeAmount);
    expect(typeof result[0].cargo).toBe('bigint');
  });

  it('retorna array vacío cuando el usuario no tiene transacciones', async () => {
    const prisma = makePrismaMock([]);
    const reader = new PrismaReevaluarCategoriasReader(prisma, makeCrypto());

    const result = await reader.findTodasDelUsuario('user-sin-tx');

    expect(result).toHaveLength(0);
  });
});
