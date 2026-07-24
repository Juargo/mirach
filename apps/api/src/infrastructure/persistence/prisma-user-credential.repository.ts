import {
  IUserCredentialRepository,
  CredencialUsuario,
  IdentidadUsuario,
} from '../../application/ports/user-credential-repository.port';
import { Email } from '../../domain/value-objects/email';
import type { PrismaClient } from '@prisma/client';

/**
 * PrismaUserCredentialRepository — implementación de `IUserCredentialRepository`.
 *
 * `buscarPorEmail` retorna `null` tanto para email desconocido como para un
 * usuario sin `passwordHash` (sin credenciales de login todavía) — ambos
 * casos son "no se puede loguear", y `LoginUseCase` los colapsa al mismo
 * `CredencialesInvalidasError` (AUTH-02, no enumeración).
 *
 * Constructor takes PrismaService directly (no NestJS decorators — clean arch).
 */
export class PrismaUserCredentialRepository implements IUserCredentialRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async buscarPorEmail(email: Email): Promise<CredencialUsuario | null> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.valor },
      select: { id: true, passwordHash: true },
    });

    if (user === null || user.passwordHash === null) {
      return null;
    }

    return { userId: user.id, passwordHash: user.passwordHash };
  }

  async buscarIdentidad(userId: string): Promise<IdentidadUsuario | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, esDemo: true },
    });

    if (user === null) {
      return null;
    }

    // A diferencia de un usuario real (que siempre tiene email), un usuario
    // demo NUNCA tiene email (`esDemo=true, email=null`) — eso es válido, no
    // "identidad incompleta" (DEMO-AUTH-05). Pero un usuario REAL
    // (`esDemo=false`) sin email es un estado inconsistente (todo usuario
    // real se crea con email) — falla cerrado (`null`, "no encontrado") en
    // vez de exponer una identidad rota, en lugar de propagarla tal cual.
    if (!user.esDemo && user.email === null) {
      return null;
    }

    return { userId: user.id, email: user.email, esDemo: user.esDemo };
  }
}
