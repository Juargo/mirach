import {
  IUserCredentialRepository,
  CredencialUsuario,
  IdentidadUsuario,
} from '../../application/ports/user-credential-repository.port';
import { Email } from '../../domain/value-objects/email';
import { PrismaService } from './prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

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

    // A diferencia de un usuario real (que siempre tiene email), un usuario
    // demo NUNCA tiene email (`esDemo=true, email=null`) — eso es válido, no
    // "identidad incompleta". Solo `user === null` (id inexistente) es "no
    // encontrado"; `email: null` se propaga tal cual (DEMO-AUTH-05).
    if (user === null) {
      return null;
    }

    return { userId: user.id, email: user.email, esDemo: user.esDemo };
  }
}
