import { Prisma, type PrismaClient } from '@prisma/client';

import { PrismaCuentaAnonimaRepository } from './prisma-cuenta-anonima.repository';
import { Email } from '../../domain/value-objects/email';
import { aceptacionTerminos } from '../../domain/value-objects/consentimiento';
import type { IBlindIndexService } from '../../application/ports/blind-index-service.port';
import type { ICryptoService } from '../../application/ports/crypto-service.port';
import { CATEGORIA_TEMPLATE, PATRON_TEMPLATE } from './catalogo-template';
import { BUCKET_IDS } from './bucket-ids';

/**
 * Unit tests for PrismaCuentaAnonimaRepository — mocked PrismaClient, fake
 * blind index and crypto. The real constraints are covered by the
 * integration suite (`cuenta-anonima.int-spec.ts`).
 */
const blindIndex: IBlindIndexService = { compute: (v) => `bi:${v}` };
const crypto: ICryptoService = {
  encrypt: (v) => `enc:${v}`,
  decrypt: (v) => v.replace(/^enc:/, ''),
};

const SIN_CREDENCIALES = {
  appleSub: null,
  googleSub: null,
  passwordHash: null,
};

function repoCon(prisma: unknown) {
  return new PrismaCuentaAnonimaRepository(
    prisma as PrismaClient,
    blindIndex,
    crypto,
  );
}

function makeTxMock() {
  return {
    user: { create: vi.fn().mockResolvedValue({ id: 'anon-1' }) },
    categoria: {
      createMany: vi
        .fn()
        .mockResolvedValue({ count: CATEGORIA_TEMPLATE.length }),
      findMany: vi.fn().mockResolvedValue(
        CATEGORIA_TEMPLATE.map((categoria, index) => ({
          id: `categoria-${index}`,
          nombre: categoria.nombre,
          bucketId: BUCKET_IDS[categoria.bucket],
        })),
      ),
    },
    patronClasificacion: {
      createMany: vi.fn().mockResolvedValue({ count: PATRON_TEMPLATE.length }),
    },
    consentimiento: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
  };
}

describe('PrismaCuentaAnonimaRepository', () => {
  describe('crear', () => {
    it('crea el usuario sin email ni credenciales, con catálogo y términos en una transacción', async () => {
      const tx = makeTxMock();
      const prisma = {
        $transaction: vi.fn(
          async (callback: (tx: unknown) => Promise<unknown>) => callback(tx),
        ),
      };
      const aceptacion = aceptacionTerminos({
        terminos: '1.0',
        privacidad: '1.0',
      }).getValue();

      const userId = await repoCon(prisma).crear(aceptacion);

      expect(userId).toBe('anon-1');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.user.create).toHaveBeenCalledWith({
        data: { nombre: 'Usuario' },
      });
      expect(tx.categoria.createMany).toHaveBeenCalledTimes(1);
      expect(tx.patronClasificacion.createMany).toHaveBeenCalledTimes(1);
      expect(tx.consentimiento.createMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('esAnonima', () => {
    it('true para un usuario sin appleSub, googleSub ni passwordHash', async () => {
      const findUnique = vi.fn().mockResolvedValue(SIN_CREDENCIALES);

      expect(await repoCon({ user: { findUnique } }).esAnonima('anon-1')).toBe(
        true,
      );
      expect(findUnique).toHaveBeenCalledWith({
        where: { id: 'anon-1' },
        select: { appleSub: true, googleSub: true, passwordHash: true },
      });
    });

    it.each([
      ['appleSub', { ...SIN_CREDENCIALES, appleSub: 'a' }],
      ['googleSub', { ...SIN_CREDENCIALES, googleSub: 'g' }],
      ['passwordHash', { ...SIN_CREDENCIALES, passwordHash: 'h' }],
    ])('false si tiene %s', async (_campo, user) => {
      const findUnique = vi.fn().mockResolvedValue(user);

      expect(await repoCon({ user: { findUnique } }).esAnonima('u')).toBe(
        false,
      );
    });

    it('false si el usuario no existe', async () => {
      const findUnique = vi.fn().mockResolvedValue(null);

      expect(await repoCon({ user: { findUnique } }).esAnonima('u')).toBe(
        false,
      );
    });
  });

  describe('existeIdentidad / existeEmailEnOtraCuenta', () => {
    it.each([
      ['apple', { appleSub: 'sub-1' }],
      ['google', { googleSub: 'sub-1' }],
    ] as const)(
      'busca el sub de %s en su propia columna',
      async (proveedor, where) => {
        const count = vi.fn().mockResolvedValue(1);

        expect(
          await repoCon({ user: { count } }).existeIdentidad(
            proveedor,
            'sub-1',
          ),
        ).toBe(true);
        expect(count).toHaveBeenCalledWith({ where });
      },
    );

    it('busca el email por su blind index, excluyendo la cuenta propia', async () => {
      const count = vi.fn().mockResolvedValue(0);
      const email = Email.crear('persona@example.com').getValue();

      expect(
        await repoCon({ user: { count } }).existeEmailEnOtraCuenta(
          email,
          'anon-1',
        ),
      ).toBe(false);
      expect(count).toHaveBeenCalledWith({
        where: {
          emailBlindIndex: 'bi:persona@example.com',
          NOT: { id: 'anon-1' },
        },
      });
    });
  });

  describe('vincular', () => {
    const email = Email.crear('persona@example.com').getValue();

    it('escribe sub, email cifrado y nombre solo si la cuenta sigue siendo anónima', async () => {
      const updateMany = vi.fn().mockResolvedValue({ count: 1 });

      const vinculada = await repoCon({ user: { updateMany } }).vincular({
        userId: 'anon-1',
        proveedor: 'apple',
        sub: 'apple-sub-1',
        email,
        nombre: 'Jorge',
      });

      expect(vinculada).toBe(true);
      expect(updateMany).toHaveBeenCalledWith({
        where: { id: 'anon-1', ...SIN_CREDENCIALES },
        data: {
          appleSub: 'apple-sub-1',
          email: 'enc:persona@example.com',
          emailBlindIndex: 'bi:persona@example.com',
          nombre: 'Jorge',
        },
      });
    });

    it('con Google y sin email ni nombre escribe solo googleSub', async () => {
      const updateMany = vi.fn().mockResolvedValue({ count: 1 });

      await repoCon({ user: { updateMany } }).vincular({
        userId: 'anon-1',
        proveedor: 'google',
        sub: 'google-sub-1',
        email: null,
        nombre: null,
      });

      expect(updateMany).toHaveBeenCalledWith({
        where: { id: 'anon-1', ...SIN_CREDENCIALES },
        data: { googleSub: 'google-sub-1' },
      });
    });

    it('false si la cuenta ya no es anónima (ninguna fila actualizada)', async () => {
      const updateMany = vi.fn().mockResolvedValue({ count: 0 });

      expect(
        await repoCon({ user: { updateMany } }).vincular({
          userId: 'anon-1',
          proveedor: 'apple',
          sub: 's',
          email: null,
          nombre: null,
        }),
      ).toBe(false);
    });

    it('false si el sub o el email ya son de otra cuenta (P2002); otros errores se propagan', async () => {
      const datos = {
        userId: 'anon-1',
        proveedor: 'apple' as const,
        sub: 's',
        email,
        nombre: null,
      };
      const p2002 = new Prisma.PrismaClientKnownRequestError('Unique', {
        code: 'P2002',
        clientVersion: '7.8.0',
      });

      expect(
        await repoCon({
          user: { updateMany: vi.fn().mockRejectedValue(p2002) },
        }).vincular(datos),
      ).toBe(false);
      await expect(
        repoCon({
          user: { updateMany: vi.fn().mockRejectedValue(new Error('db down')) },
        }).vincular(datos),
      ).rejects.toThrow('db down');
    });
  });
});
