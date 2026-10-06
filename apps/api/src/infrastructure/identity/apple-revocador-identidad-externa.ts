import type { IClienteAppleAuth } from '../../application/ports/cliente-apple-auth.port';
import type { ILogger } from '../../application/ports/logger.port';
import type { IRefreshTokenAppleRepository } from '../../application/ports/refresh-token-apple-repository.port';
import type { IRevocadorIdentidadExterna } from '../../application/ports/revocador-identidad-externa.port';

/**
 * AppleRevocadorIdentidadExterna — revoca en Apple el refresh token guardado
 * del usuario (guideline 5.1.1(v)). Se invoca ANTES del borrado de la cuenta.
 *
 * - Sin token guardado (usuario de Google/password, o que nunca envió un
 *   `authorizationCode`): no hay nada que revocar → `info` y listo.
 * - Fallo de Apple (timeout de 5 s del cliente, red, rechazo): `warn` con
 *   `userId` y `motivo`, y NO lanza — el borrado debe proceder.
 * - Si el token no se puede leer/descifrar el error sube: el use case lo
 *   captura y avisa con el nombre del error.
 * Jamás se loguea el token.
 */
export class AppleRevocadorIdentidadExterna implements IRevocadorIdentidadExterna {
  constructor(
    private readonly refreshTokens: IRefreshTokenAppleRepository,
    private readonly cliente: IClienteAppleAuth,
    private readonly logger: ILogger,
  ) {}

  async revocar(userId: string): Promise<void> {
    const refreshToken = await this.refreshTokens.obtener(userId);

    if (refreshToken === null) {
      this.logger.info(
        'revocador-apple: sin refresh token guardado, nada que revocar',
        { userId },
      );
      return;
    }

    const resultado = await this.cliente.revocarRefreshToken(refreshToken);

    if (resultado.isFail()) {
      const { motivo, detalle } = resultado.getError();
      this.logger.warn('revocador-apple: revocación fallida', {
        userId,
        motivo,
        ...(detalle !== undefined && { detalle }),
      });
      return;
    }

    this.logger.info('revocador-apple: token de Apple revocado', { userId });
  }
}
