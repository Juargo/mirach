import { Result } from '../../shared/result';
import {
  aceptacionTerminos,
  VersionesAceptadas,
} from '../../domain/value-objects/consentimiento';
import { calcularExpiracionAnonima } from '../../domain/value-objects/duracion-sesion';
import { AltaAnonimaFallidaError } from '../../domain/errors/alta-anonima-fallida.error';
import { ICuentaAnonimaRepository } from '../ports/cuenta-anonima-repository.port';
import { ISessionRepository } from '../ports/session-repository.port';
import { ISessionTokenService } from '../ports/session-token.port';
import { IReloj } from '../ports/reloj.port';
import { ILogger } from '../ports/logger.port';
import { LoginUseCaseResult } from './login.use-case';

/**
 * CrearCuentaAnonimaUseCase — alta sin Apple, Google ni email (ADR-013).
 *
 * La regla de términos es la del alta con Apple o Google (AUTH-03): con
 * `exigirTerminos`, sin versiones no se crea la cuenta. La sesión emitida
 * dura 365 días y `ValidarSesionUseCase` la extiende con el uso.
 */
export class CrearCuentaAnonimaUseCase {
  constructor(
    private readonly cuentas: ICuentaAnonimaRepository,
    private readonly sessions: ISessionRepository,
    private readonly tokens: ISessionTokenService,
    private readonly reloj: IReloj,
    private readonly logger: ILogger,
    private readonly exigirTerminos: boolean = false,
  ) {}

  async execute(
    versiones: VersionesAceptadas = {},
  ): Promise<Result<LoginUseCaseResult, AltaAnonimaFallidaError>> {
    const aceptacion = aceptacionTerminos(versiones, this.exigirTerminos);

    if (aceptacion.isFail()) {
      return Result.fail(new AltaAnonimaFallidaError('terminos-no-aceptados'));
    }

    const userId = await this.cuentas.crear(aceptacion.getValue());
    this.logger.info('crear-cuenta-anonima: usuario creado', { userId });

    const { token, tokenHash } = this.tokens.generar();
    const expiresAt = calcularExpiracionAnonima(this.reloj.ahora());
    await this.sessions.crear({ userId, tokenHash, expiresAt });

    return Result.ok({ token, userId, expiresAt });
  }
}
