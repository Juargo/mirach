import type { PrismaClient } from '@prisma/client';
import {
  ISessionRepository,
  SesionPersistida,
} from '../../application/ports/session-repository.port';

/**
 * PrismaSessionRepository — implementación de `ISessionRepository`.
 *
 * `revocarPorTokenHash` usa `deleteMany` (no `delete`) a propósito: `delete`
 * lanza si la fila no existe (P2025), lo que rompería la idempotencia exigida
 * por `LogoutUseCase` (AUTH-07 — revocar dos veces, o un hash inexistente,
 * nunca debe fallar).
 *
 * Depende de `PrismaClient` (la base), no de `PrismaService` (el artefacto Nest
 * con lifecycle hooks): así el composition root de Express (ADR-028) puede
 * pasarle un cliente plano, y el wiring Nest actual sigue válido porque
 * `PrismaService extends PrismaClient`.
 */
export class PrismaSessionRepository implements ISessionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async crear(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void> {
    await this.prisma.session.create({
      data: {
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
      },
    });
  }

  async buscarPorTokenHash(tokenHash: string): Promise<SesionPersistida | null> {
    const sesion = await this.prisma.session.findUnique({
      where: { tokenHash },
      select: { userId: true, expiresAt: true },
    });

    if (sesion === null) {
      return null;
    }

    return { userId: sesion.userId, expiresAt: sesion.expiresAt };
  }

  async revocarPorTokenHash(tokenHash: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { tokenHash } });
  }
}
