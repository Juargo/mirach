import { Result } from '../../shared/result';
import { estaExpirada } from '../../domain/value-objects/duracion-sesion';
import { SesionInvalidaError } from '../../domain/errors/sesion-invalida.error';
import { ISessionRepository } from '../ports/session-repository.port';
import { ISessionTokenService } from '../ports/session-token.port';
import { IReloj } from '../ports/reloj.port';
import { ILogger } from '../ports/logger.port';

export interface ValidarSesionResult {
  readonly userId: string;
  /** CAT038-08: si la sesión pertenece a un usuario demo — el catálogo es de solo lectura. */
  readonly esDemo: boolean;
}

/**
 * ValidarSesionUseCase — valida un token de sesión (AUTH-05, AUTH-06).
 *
 * Transporte-agnóstico: recibe un `string` plano — no le importa si vino de
 * cookie o `Authorization: Bearer`, esa decisión vive en `SessionGuard` (infra).
 *
 * Missing, unknown/tampered, o expirado → mismo `SesionInvalidaError`.
 */
export class ValidarSesionUseCase {
  constructor(
    private readonly sessions: ISessionRepository,
    private readonly tokens: ISessionTokenService,
    private readonly reloj: IReloj,
    private readonly logger: ILogger,
  ) {}

  async execute(input: {
    token: string;
  }): Promise<Result<ValidarSesionResult, SesionInvalidaError>> {
    const tokenHash = this.tokens.hashToken(input.token);
    const sesion = await this.sessions.buscarPorTokenHash(tokenHash);
    this.logger.debug('validar-sesion: lookup', { found: sesion !== null });

    if (sesion === null) {
      return Result.fail(new SesionInvalidaError());
    }

    const expirada = estaExpirada(sesion.expiresAt, this.reloj.ahora());
    this.logger.debug('validar-sesion: expiry check', { expirada });

    if (expirada) {
      return Result.fail(new SesionInvalidaError());
    }

    return Result.ok({ userId: sesion.userId, esDemo: sesion.esDemo });
  }
}
