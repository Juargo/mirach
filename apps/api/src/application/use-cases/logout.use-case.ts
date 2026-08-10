import { Result } from '../../shared/result';
import { ISessionRepository } from '../ports/session-repository.port';
import { ISessionTokenService } from '../ports/session-token.port';
import { ILogger } from '../ports/logger.port';

/**
 * LogoutUseCase — revoca la sesión actual (AUTH-07).
 *
 * Idempotente por diseño: revocar sin token, o con un token que ya no
 * corresponde a ninguna fila, sigue retornando éxito — limpiar la cookie es
 * responsabilidad del controller sin importar el resultado. Solo revoca la
 * fila de ESTA sesión; otras sesiones activas del mismo usuario no se tocan
 * (multi-sesión preservada).
 */
export class LogoutUseCase {
  constructor(
    private readonly sessions: ISessionRepository,
    private readonly tokens: ISessionTokenService,
    private readonly logger: ILogger,
  ) {}

  async execute(input: {
    token: string | undefined;
  }): Promise<Result<void, never>> {
    this.logger.debug('logout: requested', {
      hasToken: input.token !== undefined,
    });

    if (input.token === undefined) {
      return Result.ok(undefined);
    }

    const tokenHash = this.tokens.hashToken(input.token);
    await this.sessions.revocarPorTokenHash(tokenHash);
    this.logger.debug('logout: session revoked');

    return Result.ok(undefined);
  }
}
