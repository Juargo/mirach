import type { PrismaClient } from '@prisma/client';

import type { IRefreshTokenAppleRepository } from '../../application/ports/refresh-token-apple-repository.port';
import type { ICryptoService } from '../../application/ports/crypto-service.port';

/**
 * PrismaRefreshTokenAppleRepository — el refresh token de Apple vive en
 * `User.appleRefreshToken`, cifrado con el `ICryptoService` (ADR-013; la
 * clave está fuera de la BD). Se escribe con `updateMany` acotado por `id`
 * (no lanza si el usuario no existe) y siempre sobrescribe.
 */
export class PrismaRefreshTokenAppleRepository implements IRefreshTokenAppleRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly crypto: ICryptoService,
  ) {}

  async guardar(userId: string, refreshToken: string): Promise<void> {
    await this.prisma.user.updateMany({
      where: { id: userId },
      data: { appleRefreshToken: this.crypto.encrypt(refreshToken) },
    });
  }

  async obtener(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { appleRefreshToken: true },
    });

    return user?.appleRefreshToken == null
      ? null
      : this.crypto.decrypt(user.appleRefreshToken);
  }
}
