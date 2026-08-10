import { Result } from '../../shared/result';
import { SesionInvalidaError } from '../../domain/errors/sesion-invalida.error';
import {
  IUserCredentialRepository,
  IdentidadUsuario,
} from '../ports/user-credential-repository.port';
import { ILogger } from '../ports/logger.port';

/**
 * ObtenerIdentidadUseCase — respalda `GET /api/auth/me` (AUTH-09).
 *
 * El `userId` llega ya validado por `SessionGuard` — el `null` defensivo
 * (usuario no encontrado tras pasar el guard) no debería ocurrir en la
 * práctica, pero se maneja igual sin lanzar.
 *
 * `esDemo` (DEMO-AUTH-05) se propaga tal cual desde el repositorio: como
 * `IdentidadUsuario` ya incluye el campo y este use case retorna el objeto
 * completo (`Result.ok(identidad)`), no requiere lógica adicional aquí — el
 * passthrough es automático vía el tipo.
 */
export class ObtenerIdentidadUseCase {
  constructor(
    private readonly creds: IUserCredentialRepository,
    private readonly logger: ILogger,
  ) {}

  async execute(input: {
    userId: string;
  }): Promise<Result<IdentidadUsuario, SesionInvalidaError>> {
    const identidad = await this.creds.buscarIdentidad(input.userId);
    this.logger.debug('obtener-identidad: lookup', {
      found: identidad !== null,
    });

    if (identidad === null) {
      return Result.fail(new SesionInvalidaError());
    }

    return Result.ok(identidad);
  }
}
