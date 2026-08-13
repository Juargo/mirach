import { Result } from '../../shared/result';
import { Email } from '../../domain/value-objects/email';
import {
  IUserCredentialRepository,
  IdentidadUsuario,
} from '../ports/user-credential-repository.port';
import { IPasswordHasher } from '../ports/password-hasher.port';
import { ILogger } from '../ports/logger.port';
import { PerfilDemoSoloLecturaError } from '../../domain/errors/perfil-demo-solo-lectura.error';
import { NombrePerfilInvalidoError } from '../../domain/errors/nombre-perfil-invalido.error';
import { EmailInvalidoError } from '../../domain/errors/email-invalido.error';
import { PerfilRechazadoError } from '../../domain/errors/perfil-rechazado.error';

const NOMBRE_MIN = 1;
const NOMBRE_MAX = 80;

export type ActualizarPerfilError =
  | PerfilDemoSoloLecturaError
  | NombrePerfilInvalidoError
  | EmailInvalidoError
  | PerfilRechazadoError; // EmailNoDisponibleError NO aparece: se colapsa acá (D-04)

/**
 * ActualizarPerfilUseCase — `PATCH /api/perfil` (US-040, PERF040-01/02/03/04/07/08).
 *
 * Orden de validación (design.md §4.1, guard clauses — `Result.fail` primero,
 * KISS): demo → forma de `nombre` → (si hay `email`) formato → `passwordActual`
 * presente → credencial existente → password correcta → escritura. Las
 * comprobaciones baratas (2, 3a) corren ANTES del `hasher.verificar` caro
 * (3d) — esa secuencia no filtra nada porque cada fallo previo es sobre el
 * INPUT del propio llamador, nunca sobre el estado de otra cuenta.
 */
export class ActualizarPerfilUseCase {
  constructor(
    private readonly creds: IUserCredentialRepository,
    private readonly hasher: IPasswordHasher,
    private readonly logger: ILogger,
  ) {}

  async execute(input: {
    userId: string;
    esDemo: boolean; // REQUERIDO (D-05) — compile error si se olvida.
    nombre?: string;
    emailRaw?: string; // raw: el VO se crea ACÁ, no en la ruta (§5.2).
    passwordActual?: string;
  }): Promise<Result<IdentidadUsuario, ActualizarPerfilError>> {
    if (input.esDemo) {
      return Result.fail(new PerfilDemoSoloLecturaError());
    }

    let nombre: string | undefined;
    if (input.nombre !== undefined) {
      const trimmed = input.nombre.trim();
      if (trimmed.length < NOMBRE_MIN || trimmed.length > NOMBRE_MAX) {
        return Result.fail(new NombrePerfilInvalidoError());
      }
      nombre = trimmed;
    }

    let email: Email | undefined;
    if (input.emailRaw !== undefined) {
      const emailResult = Email.crear(input.emailRaw);
      if (emailResult.isFail()) {
        return Result.fail(emailResult.getError());
      }
      email = emailResult.getValue();

      if (input.passwordActual === undefined) {
        return Result.fail(new PerfilRechazadoError());
      }

      const credencial = await this.creds.buscarCredencialPorId(input.userId);
      this.logger.debug(
        'actualizar-perfil: lookup de credencial (cambio de email)',
        {
          found: credencial !== null,
        },
      );
      if (credencial === null) {
        return Result.fail(new PerfilRechazadoError());
      }

      const passwordValida = await this.hasher.verificar(
        input.passwordActual,
        credencial.passwordHash,
      );
      this.logger.debug('actualizar-perfil: verificación de password actual', {
        passwordValida,
      });
      if (!passwordValida) {
        return Result.fail(new PerfilRechazadoError());
      }
    }

    this.logger.debug('actualizar-perfil: campos solicitados', {
      cambiaNombre: nombre !== undefined,
      cambiaEmail: email !== undefined,
    });

    const result = await this.creds.actualizarPerfil({
      userId: input.userId,
      nombre,
      email,
    });

    if (result.isFail()) {
      // EmailNoDisponibleError del port ⇒ colapsa al MISMO rechazo genérico
      // que un passwordActual incorrecto (D-04, anti-enumeración PERF040-04).
      return Result.fail(new PerfilRechazadoError());
    }

    return Result.ok(result.getValue());
  }
}
