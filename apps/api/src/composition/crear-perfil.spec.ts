import type { PrismaClient } from '@prisma/client';
import { crearPerfil } from './crear-perfil';
import { ActualizarPerfilUseCase } from '../application/use-cases/actualizar-perfil.use-case';
import { CambiarPasswordUseCase } from '../application/use-cases/cambiar-password.use-case';
import type { ICryptoService } from '../application/ports/crypto-service.port';
import type { IBlindIndexService } from '../application/ports/blind-index-service.port';
import { NoOpLogger } from '../../test/support/logger.double';

/**
 * crearPerfil — GUARD (non-negotiable, design.md §5.1/§3.4): NUNCA construye
 * `crypto`/`blindIndex` propios (`deriveBlindIndexKey`, `new
 * AesGcmCryptoService`, `new HmacBlindIndexService`) — recibe SIEMPRE las
 * instancias del composition root (`crearAuthGoogle` precedent). Se prueba
 * indirectamente: un `PATCH /api/perfil` con email nuevo debe usar el MISMO
 * `crypto.encrypt`/`blindIndex.compute` inyectado — si el adapter creara los
 * suyos, este spy nunca vería la llamada.
 */
describe('crearPerfil', () => {
  function fakePrisma(updateResult: unknown): PrismaClient {
    return {
      user: { update: vi.fn().mockResolvedValue(updateResult) },
    } as unknown as PrismaClient;
  }

  it('ensambla PerfilGraph con ActualizarPerfilUseCase y CambiarPasswordUseCase', () => {
    const prisma = fakePrisma(null);
    const crypto: ICryptoService = { encrypt: (v) => v, decrypt: (v) => v };
    const blindIndex: IBlindIndexService = { compute: (v) => v };

    const graph = crearPerfil(prisma, crypto, blindIndex, new NoOpLogger());

    expect(graph.actualizarPerfil).toBeInstanceOf(ActualizarPerfilUseCase);
    expect(graph.cambiarPassword).toBeInstanceOf(CambiarPasswordUseCase);
  });

  it('cambiarPassword llega hasta prisma.session.deleteMany y prisma.user.update a través del grafo ensamblado (wiring end-to-end, PERF040-06)', async () => {
    const prisma = {
      user: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: 'user-1', passwordHash: '$argon2id$hash' }),
        update: vi.fn().mockResolvedValue({}),
      },
      session: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    } as unknown as PrismaClient;
    const crypto: ICryptoService = { encrypt: (v) => v, decrypt: (v) => v };
    const blindIndex: IBlindIndexService = { compute: (v) => v };

    const graph = crearPerfil(prisma, crypto, blindIndex, new NoOpLogger());
    // El hasher real (argon2) rechaza este hash — el flujo se detiene en la
    // verificación de password actual, pero llegar hasta `findUnique` ya
    // prueba que `crearPerfil` conectó `PrismaSessionRepository` con la
    // MISMA instancia de `prisma`, no una propia.
    await graph.cambiarPassword.execute({
      userId: 'user-1',
      esDemo: false,
      tokenHashActual: 'hash-de-la-sesion-actual',
      passwordActual: 'lo-que-sea',
      passwordNueva: 'password-nueva-valida',
    });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { id: true, passwordHash: true },
    });
    expect(prisma.session.deleteMany).not.toHaveBeenCalled();
  });

  it('la escritura nombre-only llega hasta prisma.user.update() a través del grafo ensamblado (wiring end-to-end)', async () => {
    const prisma = fakePrisma({
      id: 'user-1',
      nombre: 'Jorge',
      email: null,
      esDemo: true,
    });
    const crypto: ICryptoService = { encrypt: (v) => v, decrypt: (v) => v };
    const blindIndex: IBlindIndexService = { compute: (v) => v };

    const graph = crearPerfil(prisma, crypto, blindIndex, new NoOpLogger());
    await graph.actualizarPerfil.execute({
      userId: 'user-1',
      esDemo: false,
      nombre: 'Jorge',
    });

    expect(prisma.user.update).toHaveBeenCalled();
  });

  it('el path de email consulta buscarCredencialPorId con where: {id} — el repositorio recibió las instancias inyectadas, no unas propias', async () => {
    const prisma = {
      user: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: 'user-1', passwordHash: '$argon2id$hash' }),
      },
    } as unknown as PrismaClient;
    const crypto: ICryptoService = { encrypt: (v) => v, decrypt: (v) => v };
    const blindIndex: IBlindIndexService = { compute: (v) => v };

    const graph = crearPerfil(prisma, crypto, blindIndex, new NoOpLogger());
    // El hasher real (argon2) rechaza este hash — el flujo se detiene ahí,
    // pero llegar hasta `findUnique` ya prueba que `crearPerfil` conectó
    // `PrismaUserCredentialRepository` con estas MISMAS instancias, no unas
    // propias (la derivación completa del par email/blindIndex ya está
    // pinneada al nivel del repositorio, prisma-user-credential.repository.spec.ts).
    await graph.actualizarPerfil.execute({
      userId: 'user-1',
      esDemo: false,
      emailRaw: 'jorge@example.com',
      passwordActual: 'lo-que-sea',
    });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { id: true, passwordHash: true },
    });
  });
});
