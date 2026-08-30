import { Prisma, type PrismaClient } from '@prisma/client';

import { PrismaIdentidadGoogleRepository } from './prisma-identidad-google.repository';
import { Email } from '../../domain/value-objects/email';
import type { IBlindIndexService } from '../../application/ports/blind-index-service.port';
import type { ICryptoService } from '../../application/ports/crypto-service.port';
import { CATEGORIA_TEMPLATE, PATRON_TEMPLATE } from './catalogo-template';

/**
 * Unit tests for PrismaIdentidadGoogleRepository (design §5.2/§5.4/§5.5) —
 * mocked PrismaClient, fake blindIndex. DB-backed behaviour (real unique
 * constraint, real concurrent race, real shared-instance derivation against
 * `PrismaUserCredentialRepository`) is covered by the deferred int-spec
 * suite (`test/prisma-identidad-google.int-spec.ts`).
 */
function makeBlindIndex(computeFn?: (v: string) => string): IBlindIndexService {
  return {
    compute: computeFn ?? ((v: string) => `bi:${v}`),
  };
}

function makeCrypto(): ICryptoService {
  return {
    encrypt: (v: string) => `enc:${v}`,
    decrypt: (v: string) => v.replace(/^enc:/, ''),
  };
}

describe('PrismaIdentidadGoogleRepository', () => {
  describe('buscarPorGoogleSub', () => {
    it('busca por la columna googleSub y mapea a UsuarioVinculable', async () => {
      const findUnique = vi.fn().mockResolvedValue({
        id: 'user-1',
        esDemo: false,
        googleSub: 'google-sub-1',
      });
      const prisma = { user: { findUnique } } as unknown as PrismaClient;
      const repo = new PrismaIdentidadGoogleRepository(
        prisma,
        makeBlindIndex(),
        makeCrypto(),
      );

      const resultado = await repo.buscarPorGoogleSub('google-sub-1');

      expect(findUnique).toHaveBeenCalledWith({
        where: { googleSub: 'google-sub-1' },
        select: { id: true, esDemo: true, googleSub: true },
      });
      expect(resultado).toEqual({
        userId: 'user-1',
        esDemo: false,
        googleSub: 'google-sub-1',
      });
    });

    it('devuelve null si no hay match', async () => {
      const findUnique = vi.fn().mockResolvedValue(null);
      const prisma = { user: { findUnique } } as unknown as PrismaClient;
      const repo = new PrismaIdentidadGoogleRepository(
        prisma,
        makeBlindIndex(),
        makeCrypto(),
      );

      expect(await repo.buscarPorGoogleSub('sin-match')).toBeNull();
    });
  });

  describe('buscarPorEmail', () => {
    it('computa el blind index del email normalizado y busca por emailBlindIndex', async () => {
      const computeSpy = vi.fn((v: string) => `bi:${v}`);
      const findUnique = vi.fn().mockResolvedValue({
        id: 'user-2',
        esDemo: false,
        googleSub: null,
      });
      const prisma = { user: { findUnique } } as unknown as PrismaClient;
      const repo = new PrismaIdentidadGoogleRepository(
        prisma,
        makeBlindIndex(computeSpy),
        makeCrypto(),
      );
      const email = Email.crear('Jorge@Example.com').getValue();

      const resultado = await repo.buscarPorEmail(email);

      expect(computeSpy).toHaveBeenCalledWith('jorge@example.com');
      expect(findUnique).toHaveBeenCalledWith({
        where: { emailBlindIndex: 'bi:jorge@example.com' },
        select: { id: true, esDemo: true, googleSub: true },
      });
      expect(resultado).toEqual({
        userId: 'user-2',
        esDemo: false,
        googleSub: null,
      });
    });

    it('devuelve null si no hay match', async () => {
      const findUnique = vi.fn().mockResolvedValue(null);
      const prisma = { user: { findUnique } } as unknown as PrismaClient;
      const repo = new PrismaIdentidadGoogleRepository(
        prisma,
        makeBlindIndex(),
        makeCrypto(),
      );

      const resultado = await repo.buscarPorEmail(
        Email.crear('nadie@example.com').getValue(),
      );

      expect(resultado).toBeNull();
    });
  });

  describe('vincularGoogleSub', () => {
    it('usa updateMany condicional (WHERE id + googleSub IS NULL) y devuelve true si count === 1', async () => {
      const updateMany = vi.fn().mockResolvedValue({ count: 1 });
      const prisma = { user: { updateMany } } as unknown as PrismaClient;
      const repo = new PrismaIdentidadGoogleRepository(
        prisma,
        makeBlindIndex(),
        makeCrypto(),
      );

      const resultado = await repo.vincularGoogleSub('user-2', 'google-sub-2');

      expect(updateMany).toHaveBeenCalledWith({
        where: { id: 'user-2', googleSub: null },
        data: { googleSub: 'google-sub-2' },
      });
      expect(resultado).toBe(true);
    });

    it('devuelve false cuando count === 0 (la fila ya no cumplía googleSub IS NULL — carrera perdida, 4R carry-forward)', async () => {
      const updateMany = vi.fn().mockResolvedValue({ count: 0 });
      const prisma = { user: { updateMany } } as unknown as PrismaClient;
      const repo = new PrismaIdentidadGoogleRepository(
        prisma,
        makeBlindIndex(),
        makeCrypto(),
      );

      const resultado = await repo.vincularGoogleSub('user-2', 'google-sub-2');

      expect(resultado).toBe(false);
    });

    it('captura P2002 (colisión de unicidad concurrente TOCTOU) y devuelve false en vez de lanzar (4R carry-forward)', async () => {
      const updateMany = vi.fn().mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '7.8.0',
        }),
      );
      const prisma = { user: { updateMany } } as unknown as PrismaClient;
      const repo = new PrismaIdentidadGoogleRepository(
        prisma,
        makeBlindIndex(),
        makeCrypto(),
      );

      const resultado = await repo.vincularGoogleSub('user-2', 'google-sub-2');

      expect(resultado).toBe(false);
    });

    it('propaga cualquier otro error de Prisma (no P2002) — no es un resultado de negocio', async () => {
      const updateMany = vi
        .fn()
        .mockRejectedValue(new Error('conexión perdida'));
      const prisma = { user: { updateMany } } as unknown as PrismaClient;
      const repo = new PrismaIdentidadGoogleRepository(
        prisma,
        makeBlindIndex(),
        makeCrypto(),
      );

      await expect(
        repo.vincularGoogleSub('user-2', 'google-sub-2'),
      ).rejects.toThrow('conexión perdida');
    });
  });

  describe('buscarPorId (VINC041-03/04, design §3.3)', () => {
    it('busca por PK (findUnique where id) con el mismo select y mapea a UsuarioVinculable', async () => {
      const findUnique = vi.fn().mockResolvedValue({
        id: 'user-3',
        esDemo: false,
        googleSub: 'google-sub-3',
      });
      const prisma = { user: { findUnique } } as unknown as PrismaClient;
      const repo = new PrismaIdentidadGoogleRepository(
        prisma,
        makeBlindIndex(),
        makeCrypto(),
      );

      const resultado = await repo.buscarPorId('user-3');

      expect(findUnique).toHaveBeenCalledWith({
        where: { id: 'user-3' },
        select: { id: true, esDemo: true, googleSub: true },
      });
      expect(resultado).toEqual({
        userId: 'user-3',
        esDemo: false,
        googleSub: 'google-sub-3',
      });
    });

    it('devuelve null cuando no hay match', async () => {
      const findUnique = vi.fn().mockResolvedValue(null);
      const prisma = { user: { findUnique } } as unknown as PrismaClient;
      const repo = new PrismaIdentidadGoogleRepository(
        prisma,
        makeBlindIndex(),
        makeCrypto(),
      );

      expect(await repo.buscarPorId('nadie')).toBeNull();
    });
  });

  describe('desvincularGoogleSub (VINC041-05, CA-03 — design §1/Q4, D-06)', () => {
    it('usa updateMany condicional cuyo argumento es EXACTAMENTE el invariante CA-03 (WHERE passwordHash NOT NULL + googleSub NOT NULL) y devuelve true si count === 1', async () => {
      const updateMany = vi.fn().mockResolvedValue({ count: 1 });
      const prisma = { user: { updateMany } } as unknown as PrismaClient;
      const repo = new PrismaIdentidadGoogleRepository(
        prisma,
        makeBlindIndex(),
        makeCrypto(),
      );

      const resultado = await repo.desvincularGoogleSub('user-4');

      // Este literal ES el invariante: una spec que solo comprobara
      // `count === 1` pasaría contra un update sin predicado — por eso se
      // pinéa el argumento completo, no solo el resultado (task 3.3).
      expect(updateMany).toHaveBeenCalledWith({
        where: {
          id: 'user-4',
          passwordHash: { not: null },
          googleSub: { not: null },
        },
        data: { googleSub: null },
      });
      expect(resultado).toBe(true);
    });

    it('devuelve false cuando count === 0 (nada que limpiar — idempotente)', async () => {
      const updateMany = vi.fn().mockResolvedValue({ count: 0 });
      const prisma = { user: { updateMany } } as unknown as PrismaClient;
      const repo = new PrismaIdentidadGoogleRepository(
        prisma,
        makeBlindIndex(),
        makeCrypto(),
      );

      const resultado = await repo.desvincularGoogleSub('user-4');

      expect(resultado).toBe(false);
    });

    it('propaga cualquier error de Prisma sin capturarlo (no toca ninguna columna única — cualquier rechazo es una falla real de infraestructura)', async () => {
      const updateMany = vi
        .fn()
        .mockRejectedValue(new Error('conexión perdida'));
      const prisma = { user: { updateMany } } as unknown as PrismaClient;
      const repo = new PrismaIdentidadGoogleRepository(
        prisma,
        makeBlindIndex(),
        makeCrypto(),
      );

      await expect(repo.desvincularGoogleSub('user-4')).rejects.toThrow(
        'conexión perdida',
      );
    });
  });
});

describe('crearDesdeGoogle (ADR-041 signup-on-first-login)', () => {
  function makeTxMock() {
    return {
      user: { create: vi.fn().mockResolvedValue({ id: 'user-nuevo-1' }) },
      // Fake mínimo que satisface CatalogoTemplateClient —
      // copiarCatalogoTemplate corre de VERDAD contra este tx (mismo criterio
      // que prisma-demo.repository.spec.ts): las asserts verifican el wiring
      // real, no un doble.
      categoria: {
        createMany: vi
          .fn()
          .mockResolvedValue({ count: CATEGORIA_TEMPLATE.length }),
        findMany: vi.fn().mockResolvedValue(
          CATEGORIA_TEMPLATE.map((categoria, index) => ({
            id: `categoria-g-${index}`,
            nombre: categoria.nombre,
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

  function makePrismaTx(tx: ReturnType<typeof makeTxMock>) {
    return {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(tx),
      ),
    } as unknown as PrismaClient;
  }

  it('crea el usuario passwordless (email cifrado + blind index + googleSub) y materializa el catálogo en la MISMA transacción', async () => {
    const tx = makeTxMock();
    const prisma = makePrismaTx(tx);
    const repo = new PrismaIdentidadGoogleRepository(
      prisma,
      makeBlindIndex(),
      makeCrypto(),
    );

    const userId = await repo.crearDesdeGoogle({
      email: Email.crear('Ana.Perez@Gmail.com').getValue(),
      googleSub: 'google-sub-nuevo',
      nombre: 'ana.perez',
    });

    expect(userId).toBe('user-nuevo-1');
    expect(tx.user.create).toHaveBeenCalledWith({
      data: {
        nombre: 'ana.perez',
        email: 'enc:ana.perez@gmail.com',
        emailBlindIndex: 'bi:ana.perez@gmail.com',
        googleSub: 'google-sub-nuevo',
      },
    });
    // passwordHash NUNCA viaja en el create — la fila nace passwordless.
    const createData = (tx.user.create.mock.calls[0][0] as { data: object })
      .data;
    expect(Object.keys(createData)).not.toContain('passwordHash');
    // Catálogo materializado con el userId recién creado (ADR-036).
    expect(tx.categoria.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ userId: 'user-nuevo-1' }),
      ]),
    });
    expect(
      (
        tx.categoria.createMany.mock.calls[0][0] as {
          data: ReadonlyArray<unknown>;
        }
      ).data,
    ).toHaveLength(CATEGORIA_TEMPLATE.length);
    expect(
      (
        tx.patronClasificacion.createMany.mock.calls[0][0] as {
          data: ReadonlyArray<unknown>;
        }
      ).data,
    ).toHaveLength(PATRON_TEMPLATE.length);
  });

  describe('P2002 discrimination (fix de revisión WARNING — no todo P2002 dentro de la tx es la carrera de User)', () => {
    async function crear(prisma: PrismaClient) {
      const repo = new PrismaIdentidadGoogleRepository(
        prisma,
        makeBlindIndex(),
        makeCrypto(),
      );
      return repo.crearDesdeGoogle({
        email: Email.crear('ana@example.com').getValue(),
        googleSub: 'google-sub-nuevo',
        nombre: 'ana',
      });
    }

    it('target ausente (meta sin target) → null (carrera conservadora)', async () => {
      const error = new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'test',
      });
      const prisma = {
        $transaction: vi.fn().mockRejectedValue(error),
      } as unknown as PrismaClient;

      expect(await crear(prisma)).toBeNull();
    });

    it("target: ['emailBlindIndex'] (unique de User) → null", async () => {
      const error = new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['emailBlindIndex'] },
      });
      const prisma = {
        $transaction: vi.fn().mockRejectedValue(error),
      } as unknown as PrismaClient;

      expect(await crear(prisma)).toBeNull();
    });

    it("target: ['googleSub'] (unique de User) → null", async () => {
      const error = new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['googleSub'] },
      });
      const prisma = {
        $transaction: vi.fn().mockRejectedValue(error),
      } as unknown as PrismaClient;

      expect(await crear(prisma)).toBeNull();
    });

    it('target como string (constraint name) conteniendo "googleSub" → null', async () => {
      const error = new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: 'User_googleSub_key' },
      });
      const prisma = {
        $transaction: vi.fn().mockRejectedValue(error),
      } as unknown as PrismaClient;

      expect(await crear(prisma)).toBeNull();
    });

    it("target: ['userId', 'nombre'] (unique compuesta de Categoria, ADR-036) → RETHROWS — bug de datos, no carrera", async () => {
      const error = new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['userId', 'nombre'] },
      });
      const prisma = {
        $transaction: vi.fn().mockRejectedValue(error),
      } as unknown as PrismaClient;

      await expect(crear(prisma)).rejects.toThrow(error);
    });

    it('target como string de constraint de Categoria → RETHROWS', async () => {
      const error = new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: 'Categoria_userId_nombre_key' },
      });
      const prisma = {
        $transaction: vi.fn().mockRejectedValue(error),
      } as unknown as PrismaClient;

      await expect(crear(prisma)).rejects.toThrow(error);
    });
  });

  it('cualquier otro error de Prisma propaga (falla real de infraestructura)', async () => {
    const prisma = {
      $transaction: vi.fn().mockRejectedValue(new Error('conexion caida')),
    } as unknown as PrismaClient;
    const repo = new PrismaIdentidadGoogleRepository(
      prisma,
      makeBlindIndex(),
      makeCrypto(),
    );

    await expect(
      repo.crearDesdeGoogle({
        email: Email.crear('ana@example.com').getValue(),
        googleSub: 'google-sub-nuevo',
        nombre: 'ana',
      }),
    ).rejects.toThrow('conexion caida');
  });
});
