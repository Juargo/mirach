import { Result } from '../../shared/result';
import { estaExpirada } from '../../domain/value-objects/duracion-sesion';
import { FusionFallidaError } from '../../domain/errors/fusion-fallida.error';
import { ICuentaAnonimaRepository } from '../ports/cuenta-anonima-repository.port';
import {
  IFusionCuentasRepository,
  ResumenFusion,
} from '../ports/fusion-cuentas-repository.port';
import { ILogger } from '../ports/logger.port';
import { IReloj } from '../ports/reloj.port';
import { ISessionRepository } from '../ports/session-repository.port';
import { ISessionTokenService } from '../ports/session-token.port';

/**
 * FusionarCuentaUseCase — une una cuenta anónima con la cuenta de la sesión
 * (ADR-014). El destino es SIEMPRE quien llama; el origen sale del token de
 * sesión que el body trae, que prueba que quien llama es su dueño.
 *
 * El origen se resuelve con el hash del token y `buscarPorTokenHash`, SIN
 * `ValidarSesionUseCase`: validar renovaría la sesión del origen y la fusión
 * la va a borrar. Token desconocido, vencido, de una cuenta con credenciales
 * o del propio destino: un solo motivo, `origen-invalido`.
 *
 * Las comprobaciones de aquí son un filtro previo; la fusión las repite
 * dentro de su transacción, con los dos usuarios bloqueados.
 *
 * Redacción (ADR-009): nunca se loguea el token ni su hash, solo ids y conteos.
 */
export class FusionarCuentaUseCase {
  constructor(
    private readonly cuentas: ICuentaAnonimaRepository,
    private readonly sessions: ISessionRepository,
    private readonly tokens: ISessionTokenService,
    private readonly reloj: IReloj,
    private readonly fusion: IFusionCuentasRepository,
    private readonly logger: ILogger,
  ) {}

  async execute(input: {
    destinoUserId: string;
    tokenOrigen: string;
  }): Promise<Result<ResumenFusion, FusionFallidaError>> {
    const { destinoUserId, tokenOrigen } = input;

    if (await this.cuentas.esAnonima(destinoUserId)) {
      return Result.fail(new FusionFallidaError('destino-anonimo'));
    }

    const sesion = await this.sessions.buscarPorTokenHash(
      this.tokens.hashToken(tokenOrigen),
    );
    if (
      sesion === null ||
      estaExpirada(sesion.expiresAt, this.reloj.ahora()) ||
      sesion.anonima !== true ||
      sesion.userId === destinoUserId
    ) {
      return Result.fail(new FusionFallidaError('origen-invalido'));
    }

    const resumen = await this.fusion.fusionar(sesion.userId, destinoUserId);
    if (resumen === null) {
      return Result.fail(new FusionFallidaError('origen-invalido'));
    }

    this.logger.info('fusionar-cuenta: cuentas fusionadas', {
      origenUserId: sesion.userId,
      destinoUserId,
      ...resumen,
    });

    return Result.ok(resumen);
  }
}
