import { Result } from '../../shared/result';
import { Password } from '../../domain/value-objects/password';
import { IUserCredentialRepository } from '../ports/user-credential-repository.port';
import { ISessionRepository } from '../ports/session-repository.port';
import { IPasswordHasher } from '../ports/password-hasher.port';
import { ILogger } from '../ports/logger.port';
import { PerfilDemoSoloLecturaError } from '../../domain/errors/perfil-demo-solo-lectura.error';
import { PerfilRechazadoError } from '../../domain/errors/perfil-rechazado.error';
import { PasswordInvalidaError } from '../../domain/errors/password-invalida.error';

export type CambiarPasswordError =
  | PerfilDemoSoloLecturaError
  | PerfilRechazadoError
  | PasswordInvalidaError;

/**
 * CambiarPasswordUseCase — `PATCH /api/perfil/password` (US-040,
 * PERF040-03(password half)/05/06).
 *
 * Orden (design.md §4.3): demo → credencial existente → verificar password
 * actual → validar password nueva → hash → **revocar-luego-escribir** (no
 * transacción cross-agregado; el orden mismo hace inalcanzable el estado
 * prohibido, §4.3/F3) → escribir el nuevo hash.
 *
 * `esDemo`/`tokenHashActual` son inputs REQUERIDOS (compile-enforced, D-05).
 */
export class CambiarPasswordUseCase {
  constructor(
    private readonly creds: IUserCredentialRepository,
    private readonly sessions: ISessionRepository,
    private readonly hasher: IPasswordHasher,
    private readonly logger: ILogger,
  ) {}

  async execute(input: {
    userId: string;
    esDemo: boolean; // REQUERIDO (D-05) — compile error si se olvida.
    tokenHashActual: string; // REQUERIDO (§4.3) — la sesión que NO se revoca.
    passwordActual: string;
    passwordNueva: string;
  }): Promise<Result<void, CambiarPasswordError>> {
    if (input.esDemo) {
      return Result.fail(new PerfilDemoSoloLecturaError());
    }

    const credencial = await this.creds.buscarCredencialPorId(input.userId);
    this.logger.debug('cambiar-password: lookup de credencial', {
      found: credencial !== null,
    });
    if (credencial === null) {
      return Result.fail(new PerfilRechazadoError());
    }

    const passwordActualValida = await this.hasher.verificar(
      input.passwordActual,
      credencial.passwordHash,
    );
    this.logger.debug('cambiar-password: verificación de password actual', {
      passwordActualValida,
    });
    if (!passwordActualValida) {
      return Result.fail(new PerfilRechazadoError());
    }

    const passwordNuevaResult = Password.crear(input.passwordNueva);
    if (passwordNuevaResult.isFail()) {
      return Result.fail(passwordNuevaResult.getError());
    }
    const passwordNueva = passwordNuevaResult.getValue();

    const hash = await this.hasher.hash(passwordNueva.valor);

    // Orden, no transacción (design.md §4.3/F3): TODA sesión que exista en
    // este punto es la del llamador (se conserva a propósito) o queda
    // borrada acá — el estado prohibido (password nueva persistida mientras
    // sobrevive una sesión robada pre-cambio) es INALCANZABLE por orden.
    await this.sessions.revocarOtrasPorUserId(
      input.userId,
      input.tokenHashActual,
    );
    this.logger.debug('cambiar-password: sesiones revocadas', {
      userId: input.userId,
    });

    await this.creds.actualizarPassword(input.userId, hash);

    return Result.ok(undefined);
  }
}
