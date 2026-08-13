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
 * instancias del composition root (`crearAuthGoogle` precedent).
 *
 * CORRECCIÓN (PR#2, judgment de PR#1): este archivo prueba SOLO que
 * `crearPerfil` conecta `PrismaUserCredentialRepository`/
 * `PrismaSessionRepository` con la MISMA instancia de `prisma` inyectada —
 * ninguno de los tests de acá llega a ejecutar `camposEmail()` (el hasher
 * real de argon2 corta el flujo antes, en la verificación de
 * `passwordActual`), así que NO son prueba de que `crypto.encrypt`/
 * `blindIndex.compute` sean las instancias inyectadas. Esa prueba real vive
 * en `prisma-user-credential.repository.spec.ts` (unit, `crypto`/
 * `blindIndex` espiados directamente) y en
 * `test/perfil-email-change.e2e-spec.ts` (e2e, contra el container real —
 * si `crearPerfil` derivara sus propias claves, ese login con el email nuevo
 * fallaría).
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

  it('cambiarPassword llega hasta prisma.user.findUnique — el repositorio de sesiones/credenciales recibió la MISMA instancia de prisma, no una propia (PERF040-06)', async () => {
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

  it('el path de email consulta buscarCredencialPorId con where: {id} — el repositorio recibió la MISMA instancia de prisma, no una propia', async () => {
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
    // El hasher real (argon2) rechaza este hash — el flujo se detiene en la
    // verificación de `passwordActual`, ANTES de `camposEmail()`. Llegar
    // hasta `findUnique` prueba que `crearPerfil` conectó
    // `PrismaUserCredentialRepository` con esta MISMA instancia de `prisma`
    // — NO prueba nada sobre `crypto`/`blindIndex` (ver el docblock del
    // archivo para dónde vive esa prueba real).
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
