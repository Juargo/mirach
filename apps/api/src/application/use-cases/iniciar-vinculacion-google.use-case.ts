import { Result } from '../../shared/result';
import { IUserCredentialRepository } from '../ports/user-credential-repository.port';
import { IIdentidadGoogleRepository } from '../ports/identidad-google-repository.port';
import {
  IIniciadorLoginExterno,
  InicioAutorizacion,
} from '../ports/verificador-identidad-externa.port';
import { IPasswordHasher } from '../ports/password-hasher.port';
import { ILogger } from '../ports/logger.port';
import { PerfilDemoSoloLecturaError } from '../../domain/errors/perfil-demo-solo-lectura.error';
import { PerfilRechazadoError } from '../../domain/errors/perfil-rechazado.error';
import { GoogleYaVinculadoError } from '../../domain/errors/google-ya-vinculado.error';
import { VinculacionGoogleNoDisponibleError } from '../../domain/errors/vinculacion-google-no-disponible.error';

export type IniciarVinculacionGoogleError =
  | PerfilDemoSoloLecturaError
  | PerfilRechazadoError
  | GoogleYaVinculadoError
  | VinculacionGoogleNoDisponibleError;

/**
 * IniciarVinculacionGoogleUseCase — `POST /api/perfil/google/vincular`
 * (US-041, VINC041-01, design.md §4.1/§5.2).
 *
 * Orden de validación, guard clauses (`kiss`, `Result.fail` primero):
 * demo → credencial existente → password correcta → `409` pre-flight
 * (¿ya vinculado?) → `iniciador.iniciar()`.
 *
 * **GUARD note (§P1 ordering, non-negotiable)**: el pre-flight `409
 * GOOGLE_YA_VINCULADO` corre DESPUÉS de la verificación de password, no
 * antes — un `409` revela estado de la cuenta (si ya tiene Google
 * vinculado), así que gatear esa revelación detrás de la password es
 * gratis. Este es un control de UX, no de seguridad: el control real que
 * impide re-linkear vive en `VincularGoogleUseCase` (★ regla, CA-02).
 *
 * `esDemo` es un input REQUERIDO (D-05) — hay sesión acá (a diferencia de
 * `VincularGoogleUseCase`, que no la tiene), así que olvidarlo es un error
 * de compilación, no un bug silencioso.
 */
export class IniciarVinculacionGoogleUseCase {
  constructor(
    private readonly creds: IUserCredentialRepository,
    private readonly identidades: IIdentidadGoogleRepository,
    private readonly iniciador: IIniciadorLoginExterno,
    private readonly hasher: IPasswordHasher,
    private readonly logger: ILogger,
  ) {}

  async execute(input: {
    userId: string;
    esDemo: boolean; // REQUERIDO (D-05) — compile error si se olvida.
    passwordActual: string;
  }): Promise<Result<InicioAutorizacion, IniciarVinculacionGoogleError>> {
    if (input.esDemo) {
      return Result.fail(new PerfilDemoSoloLecturaError());
    }

    const credencial = await this.creds.buscarCredencialPorId(input.userId);
    this.logger.debug('iniciar-vinculacion-google: lookup de credencial', {
      found: credencial !== null,
    });
    if (credencial === null) {
      return Result.fail(new PerfilRechazadoError());
    }

    const passwordValida = await this.hasher.verificar(
      input.passwordActual,
      credencial.passwordHash,
    );
    this.logger.debug(
      'iniciar-vinculacion-google: verificación de password actual',
      { passwordValida },
    );
    if (!passwordValida) {
      return Result.fail(new PerfilRechazadoError());
    }

    const identidad = await this.identidades.buscarPorId(input.userId);
    this.logger.debug('iniciar-vinculacion-google: lookup de identidad', {
      found: identidad !== null,
    });
    if (identidad === null) {
      return Result.fail(new PerfilRechazadoError());
    }
    if (identidad.googleSub !== null) {
      return Result.fail(new GoogleYaVinculadoError());
    }

    const inicio = await this.iniciador.iniciar();
    if (inicio.isFail()) {
      this.logger.warn(
        'iniciar-vinculacion-google: fallo al iniciar autorización',
        { motivo: inicio.getError().motivo },
      );
      return Result.fail(new VinculacionGoogleNoDisponibleError());
    }

    return Result.ok(inicio.getValue());
  }
}
