import { Prisma, type PrismaClient } from '@prisma/client';

import { PrismaIdentidadGoogleRepository } from './prisma-identidad-google.repository';
import { Email } from '../../domain/value-objects/email';
import type { IBlindIndexService } from '../../application/ports/blind-index-service.port';

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
      );

      await expect(repo.desvincularGoogleSub('user-4')).rejects.toThrow(
        'conexión perdida',
      );
    });
  });
});
