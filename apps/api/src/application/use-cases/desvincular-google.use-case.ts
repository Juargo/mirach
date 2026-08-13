import { Result } from '../../shared/result';
import { IUserCredentialRepository } from '../ports/user-credential-repository.port';
import { IIdentidadGoogleRepository } from '../ports/identidad-google-repository.port';
import { IPasswordHasher } from '../ports/password-hasher.port';
import { ILogger } from '../ports/logger.port';
import { PerfilDemoSoloLecturaError } from '../../domain/errors/perfil-demo-solo-lectura.error';
import { PerfilRechazadoError } from '../../domain/errors/perfil-rechazado.error';
import { VinculoRequierePasswordError } from '../../domain/errors/vinculo-requiere-password.error';

export type DesvincularGoogleError =
  | PerfilDemoSoloLecturaError
  | VinculoRequierePasswordError
  | PerfilRechazadoError;

/**
 * DesvincularGoogleUseCase — `POST /api/perfil/google/desvincular`
 * (US-041, VINC041-05, design.md §4.3/§5.2).
 *
 * Orden de validación, guard clauses (`kiss`, `Result.fail` primero):
 * demo → credencial existente (sin `passwordHash` ⇒
 * `VinculoRequierePasswordError`, binding proof (b)) → password correcta →
 * `desvincularGoogleSub(userId)` (`true` o `false` ⇒ ambos `ok`, `204`).
 *
 * **CA-03 no vive acá.** Este use case hace una lectura (`buscarCredencialPorId`)
 * SOLO para producir el mensaje de error correcto — el invariante real "nunca
 * sin método de acceso" vive en el `WHERE` de
 * `desvincularGoogleSub` (`prisma-identidad-google.repository.ts`), un
 * `updateMany` condicional de una sola sentencia. Si esta lectura y ese
 * `WHERE` alguna vez discrepan (carrera concurrente), el `WHERE` gana y el
 * resultado se mantiene seguro — por eso `false` también es `ok`
 * (idempotente: el estado final pedido ya se sostenía, no hubo nada que
 * limpiar).
 *
 * `esDemo` es un input REQUERIDO (D-05) — hay sesión acá (igual que
 * `IniciarVinculacionGoogleUseCase`), así que olvidarlo es un error de
 * compilación, no un bug silencioso.
 */
export class DesvincularGoogleUseCase {
  constructor(
    private readonly creds: IUserCredentialRepository,
    private readonly identidades: IIdentidadGoogleRepository,
    private readonly hasher: IPasswordHasher,
    private readonly logger: ILogger,
  ) {}

  async execute(input: {
    userId: string;
    esDemo: boolean; // REQUERIDO (D-05) — compile error si se olvida.
    passwordActual: string;
  }): Promise<Result<void, DesvincularGoogleError>> {
    if (input.esDemo) {
      return Result.fail(new PerfilDemoSoloLecturaError());
    }

    const credencial = await this.creds.buscarCredencialPorId(input.userId);
    this.logger.debug('desvincular-google: lookup de credencial', {
      found: credencial !== null,
    });
    if (credencial === null) {
      // Binding proof (b): sin `passwordHash`, el MENSAJE es este error —
      // el invariante real está en el `WHERE` de `desvincularGoogleSub`.
      return Result.fail(new VinculoRequierePasswordError());
    }

    const passwordValida = await this.hasher.verificar(
      input.passwordActual,
      credencial.passwordHash,
    );
    this.logger.debug('desvincular-google: verificación de password actual', {
      passwordValida,
    });
    if (!passwordValida) {
      return Result.fail(new PerfilRechazadoError());
    }

    const limpio = await this.identidades.desvincularGoogleSub(input.userId);
    this.logger.debug('desvincular-google: outcome del write condicional', {
      limpio,
    });

    // `false` es también `ok` — idempotente, el estado final pedido
    // (sin googleSub) ya se sostenía.
    return Result.ok(undefined);
  }
}
