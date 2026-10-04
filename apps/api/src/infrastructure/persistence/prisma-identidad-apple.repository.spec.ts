import { Prisma, type PrismaClient } from '@prisma/client';

import { PrismaIdentidadAppleRepository } from './prisma-identidad-apple.repository';
import { Email } from '../../domain/value-objects/email';
import type { IBlindIndexService } from '../../application/ports/blind-index-service.port';
import type { ICryptoService } from '../../application/ports/crypto-service.port';
import { CATEGORIA_TEMPLATE, PATRON_TEMPLATE } from './catalogo-template';
import { BUCKET_IDS } from './bucket-ids';

/**
 * Unit tests for PrismaIdentidadAppleRepository — mocked PrismaClient, fake
 * blind index and crypto. Mirror of `prisma-identidad-google.repository.spec`.
 * The real unique-constraint behaviour is covered by the integration suite.
 */
const blindIndex: IBlindIndexService = { compute: (v) => `bi:${v}` };
const crypto: ICryptoService = {
  encrypt: (v) => `enc:${v}`,
  decrypt: (v) => v.replace(/^enc:/, ''),
};

function p2002(meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '7.8.0',
    meta,
  });
}

function repoCon(prisma: unknown) {
  return new PrismaIdentidadAppleRepository(
    prisma as PrismaClient,
    blindIndex,
    crypto,
  );
}

describe('PrismaIdentidadAppleRepository', () => {
  describe('buscarPorAppleSub', () => {
    it('busca por la columna appleSub y mapea a UsuarioApple', async () => {
      const findUnique = vi
        .fn()
        .mockResolvedValue({ id: 'user-1', appleSub: 'apple-sub-1' });

      const resultado = await repoCon({
        user: { findUnique },
      }).buscarPorAppleSub('apple-sub-1');

      expect(findUnique).toHaveBeenCalledWith({
        where: { appleSub: 'apple-sub-1' },
        select: { id: true, appleSub: true },
      });
      expect(resultado).toEqual({ userId: 'user-1', appleSub: 'apple-sub-1' });
    });

    it('devuelve null si no hay match', async () => {
      const findUnique = vi.fn().mockResolvedValue(null);

      expect(
        await repoCon({ user: { findUnique } }).buscarPorAppleSub('nadie'),
      ).toBeNull();
    });
  });

  describe('buscarPorEmail', () => {
    it('busca por el blind index del email normalizado', async () => {
      const findUnique = vi
        .fn()
        .mockResolvedValue({ id: 'user-2', appleSub: null });

      const resultado = await repoCon({ user: { findUnique } }).buscarPorEmail(
        Email.crear('Jorge@Example.com').getValue(),
      );

      expect(findUnique).toHaveBeenCalledWith({
        where: { emailBlindIndex: 'bi:jorge@example.com' },
        select: { id: true, appleSub: true },
      });
      expect(resultado).toEqual({ userId: 'user-2', appleSub: null });
    });

    it('devuelve null si no hay match', async () => {
      const findUnique = vi.fn().mockResolvedValue(null);

      expect(
        await repoCon({ user: { findUnique } }).buscarPorEmail(
          Email.crear('a@b.cl').getValue(),
        ),
      ).toBeNull();
    });
  });

  describe('vincularAppleSub', () => {
    it('hace un updateMany condicional (appleSub IS NULL) y devuelve true si count === 1', async () => {
      const updateMany = vi.fn().mockResolvedValue({ count: 1 });

      const resultado = await repoCon({
        user: { updateMany },
      }).vincularAppleSub('user-2', 'apple-sub-2');

      expect(updateMany).toHaveBeenCalledWith({
        where: { id: 'user-2', appleSub: null },
        data: { appleSub: 'apple-sub-2' },
      });
      expect(resultado).toBe(true);
    });

    it('devuelve false cuando count === 0 (carrera perdida)', async () => {
      const updateMany = vi.fn().mockResolvedValue({ count: 0 });

      expect(
        await repoCon({ user: { updateMany } }).vincularAppleSub('u', 's'),
      ).toBe(false);
    });

    it('captura P2002 y devuelve false en vez de lanzar', async () => {
      const updateMany = vi.fn().mockRejectedValue(p2002());

      expect(
        await repoCon({ user: { updateMany } }).vincularAppleSub('u', 's'),
      ).toBe(false);
    });

    it('propaga cualquier otro error de Prisma', async () => {
      const updateMany = vi
        .fn()
        .mockRejectedValue(new Error('conexión perdida'));

      await expect(
        repoCon({ user: { updateMany } }).vincularAppleSub('u', 's'),
      ).rejects.toThrow('conexión perdida');
    });
  });

  describe('crearDesdeApple', () => {
    function makeTxMock() {
      return {
        user: { create: vi.fn().mockResolvedValue({ id: 'user-nuevo-1' }) },
        categoria: {
          createMany: vi
            .fn()
            .mockResolvedValue({ count: CATEGORIA_TEMPLATE.length }),
          findMany: vi.fn().mockResolvedValue(
            CATEGORIA_TEMPLATE.map((categoria, index) => ({
              id: `categoria-a-${index}`,
              nombre: categoria.nombre,
              bucketId: BUCKET_IDS[categoria.bucket],
            })),
          ),
        },
        patronClasificacion: {
          createMany: vi
            .fn()
            .mockResolvedValue({ count: PATRON_TEMPLATE.length }),
        },
      };
    }

    function prismaCon(tx: ReturnType<typeof makeTxMock>) {
      return {
        $transaction: vi.fn(
          async (callback: (tx: unknown) => Promise<unknown>) => callback(tx),
        ),
      };
    }

    const DATOS = {
      email: Email.crear('Ana.Perez@Gmail.com').getValue(),
      appleSub: 'apple-sub-nuevo',
      nombre: 'Ana Pérez',
    };

    it('crea el usuario passwordless (email cifrado + blind index + appleSub) y copia el catálogo en la MISMA transacción', async () => {
      const tx = makeTxMock();
      const prisma = prismaCon(tx);

      const userId = await repoCon(prisma).crearDesdeApple(DATOS);

      expect(userId).toBe('user-nuevo-1');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.user.create).toHaveBeenCalledWith({
        data: {
          nombre: 'Ana Pérez',
          email: 'enc:ana.perez@gmail.com',
          emailBlindIndex: 'bi:ana.perez@gmail.com',
          appleSub: 'apple-sub-nuevo',
        },
      });
      expect(tx.categoria.createMany).toHaveBeenCalledTimes(1);
      expect(tx.patronClasificacion.createMany).toHaveBeenCalledTimes(1);
    });

    it('devuelve null si pierde la carrera (P2002 sin target reconocible o sobre appleSub / emailBlindIndex)', async () => {
      for (const meta of [
        undefined,
        { target: ['appleSub'] },
        { target: ['emailBlindIndex'] },
      ]) {
        const prisma = {
          $transaction: vi.fn().mockRejectedValue(p2002(meta)),
        };

        expect(await repoCon(prisma).crearDesdeApple(DATOS)).toBeNull();
      }
    });

    it('propaga un P2002 que nombra una columna ajena (bug de datos, no carrera) y cualquier otro error', async () => {
      const ajeno = {
        $transaction: vi.fn().mockRejectedValue(p2002({ target: ['nombre'] })),
      };
      await expect(
        repoCon(ajeno).crearDesdeApple(DATOS),
      ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);

      const caida = {
        $transaction: vi.fn().mockRejectedValue(new Error('db caída')),
      };
      await expect(repoCon(caida).crearDesdeApple(DATOS)).rejects.toThrow(
        'db caída',
      );
    });
  });
});
