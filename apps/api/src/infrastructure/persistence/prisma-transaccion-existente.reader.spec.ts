import { PrismaTransaccionExistenteReader } from './prisma-transaccion-existente.reader';
import { PrismaService } from './prisma.service';
import { ICryptoService } from '../../application/ports/crypto-service.port';
import { PersistenciaFallidaError } from '../../domain/errors/persistencia-fallida.error';

/**
 * Unit tests for PrismaTransaccionExistenteReader — mocked PrismaService +
 * ICryptoService (US-005, Slice 2). DB-backed scenarios (range boundary,
 * real decrypt round-trip, userId isolation) are covered by the deferred
 * int-spec suite (Group 8).
 */
describe('PrismaTransaccionExistenteReader', () => {
  function makeRow(overrides: {
    fecha: Date;
    descripcion: string;
    cargo: bigint;
    abono: bigint;
  }) {
    return overrides;
  }

  function makeCrypto(decryptFn?: (v: string) => string): ICryptoService {
    return {
      encrypt: (v: string) => v,
      decrypt: decryptFn ?? ((v: string) => `plain(${v})`),
    };
  }

  it('llama findMany con where acotado por accountId + fecha en [gte,lte] y el select esperado', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { transaccion: { findMany } } as unknown as PrismaService;
    const reader = new PrismaTransaccionExistenteReader(prisma, makeCrypto());

    const desde = new Date('2026-07-01T00:00:00.000Z');
    const hasta = new Date('2026-07-31T00:00:00.000Z');
    await reader.buscarPorCuentaYRango('acc-1', desde, hasta);

    expect(findMany).toHaveBeenCalledWith({
      where: { accountId: 'acc-1', fecha: { gte: desde, lte: hasta } },
      select: { fecha: true, descripcion: true, cargo: true, abono: true },
    });
  });

  it('retorna Result.ok mapeando cada fila con descripcion DESCIFRADA vía crypto.decrypt', async () => {
    const row = makeRow({
      fecha: new Date('2026-07-10T00:00:00.000Z'),
      descripcion: 'cifrado-xyz',
      cargo: 5000n,
      abono: 0n,
    });
    const findMany = vi.fn().mockResolvedValue([row]);
    const prisma = { transaccion: { findMany } } as unknown as PrismaService;
    const crypto = makeCrypto((v) => `plano:${v}`);
    const reader = new PrismaTransaccionExistenteReader(prisma, crypto);

    const result = await reader.buscarPorCuentaYRango(
      'acc-1',
      new Date('2026-07-01T00:00:00.000Z'),
      new Date('2026-07-31T00:00:00.000Z'),
    );

    expect(result.isOk()).toBe(true);
    const rows = result.getValue();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      fecha: row.fecha,
      descripcion: 'plano:cifrado-xyz',
      cargo: 5000n,
      abono: 0n,
    });
  });

  it('lista vacía: retorna Result.ok([]) sin lanzar', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { transaccion: { findMany } } as unknown as PrismaService;
    const reader = new PrismaTransaccionExistenteReader(prisma, makeCrypto());

    const result = await reader.buscarPorCuentaYRango(
      'acc-1',
      new Date('2026-07-01T00:00:00.000Z'),
      new Date('2026-07-31T00:00:00.000Z'),
    );

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual([]);
  });

  it('Prisma lanza: NUNCA propaga, retorna Result.fail(PersistenciaFallidaError)', async () => {
    const findMany = vi.fn().mockRejectedValue(new Error('connection refused'));
    const prisma = { transaccion: { findMany } } as unknown as PrismaService;
    const reader = new PrismaTransaccionExistenteReader(prisma, makeCrypto());

    const result = await reader.buscarPorCuentaYRango(
      'acc-1',
      new Date('2026-07-01T00:00:00.000Z'),
      new Date('2026-07-31T00:00:00.000Z'),
    );

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PersistenciaFallidaError);
    expect(result.getError().causa).toBeInstanceOf(Error);
  });

  it('hardening note 2 (PR1 review): NO muta los Date de fechaDesde/fechaHasta recibidos', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { transaccion: { findMany } } as unknown as PrismaService;
    const reader = new PrismaTransaccionExistenteReader(prisma, makeCrypto());

    const desde = new Date('2026-07-01T00:00:00.000Z');
    const hasta = new Date('2026-07-31T00:00:00.000Z');
    const desdeOriginal = desde.getTime();
    const hastaOriginal = hasta.getTime();

    await reader.buscarPorCuentaYRango('acc-1', desde, hasta);

    expect(desde.getTime()).toBe(desdeOriginal);
    expect(hasta.getTime()).toBe(hastaOriginal);
  });
});
