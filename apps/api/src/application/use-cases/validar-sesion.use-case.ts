import { Result } from '../../shared/result';
import {
  calcularExpiracionAnonima,
  debeRenovarSesionAnonima,
  estaExpirada,
} from '../../domain/value-objects/duracion-sesion';
import { SesionInvalidaError } from '../../domain/errors/sesion-invalida.error';
import { ISessionRepository } from '../ports/session-repository.port';
import { ISessionTokenService } from '../ports/session-token.port';
import { IRenovadorSesion } from '../ports/renovador-sesion.port';
import { IReloj } from '../ports/reloj.port';
import { ILogger } from '../ports/logger.port';

export interface ValidarSesionResult {
  readonly userId: string;
  /**
   * PERF040-06 (design.md §4.3). El hash SHA-256 del token de la sesión que
   * llamó — el mismo valor que `tokens.hashToken(input.token)` YA computó en
   * la línea de arriba, no un re-hash. Único consumidor: `sessionMiddleware`
   * lo copia a `req.sessionTokenHash` para que
   * `CambiarPasswordUseCase.revocarOtrasPorUserId` sepa a quién NO revocar.
   * Es la forma que ya vive en la BD (`Session.tokenHash`) — nunca el token
   * crudo, nunca logueado, nunca serializado a una respuesta.
   */
  readonly tokenHash: string;
}

/**
 * ValidarSesionUseCase — valida un token de sesión (AUTH-05, AUTH-06).
 *
 * Transporte-agnóstico: recibe un `string` plano — no le importa si vino de
 * cookie o `Authorization: Bearer`, esa decisión vive en `SessionGuard` (infra).
 *
 * Missing, unknown/tampered, o expirado → mismo `SesionInvalidaError`.
 *
 * Sesión de una cuenta anónima (ADR-013): una sesión VIGENTE se extiende a
 * 365 días desde ahora, como máximo una vez al día. Una sesión vencida nunca
 * se revive. Si la escritura falla, la petición sigue siendo válida: se
 * reintenta en el próximo uso.
 */
export class ValidarSesionUseCase {
  constructor(
    private readonly sessions: ISessionRepository,
    private readonly tokens: ISessionTokenService,
    private readonly reloj: IReloj,
    private readonly logger: ILogger,
    private readonly renovador?: IRenovadorSesion,
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

    if (sesion.anonima === true) {
      await this.renovarSiCorresponde(tokenHash, sesion.expiresAt);
    }

    return Result.ok({
      userId: sesion.userId,
      tokenHash,
    });
  }

  private async renovarSiCorresponde(
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    const ahora = this.reloj.ahora();

    if (
      this.renovador === undefined ||
      !debeRenovarSesionAnonima(expiresAt, ahora)
    ) {
      return;
    }

    try {
      await this.renovador.renovar(tokenHash, calcularExpiracionAnonima(ahora));
    } catch (err) {
      this.logger.warn('validar-sesion: no se pudo renovar la sesión anónima', {
        errorName: err instanceof Error ? err.name : 'UnknownError',
      });
    }
  }
}
