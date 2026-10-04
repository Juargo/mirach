import { Result } from '../../shared/result';
import { IIdentidadGoogleRepository } from '../ports/identidad-google-repository.port';
import { ILogger } from '../ports/logger.port';
import { VinculacionGoogleFallidaError } from '../../domain/errors/vinculacion-google-fallida.error';

/**
 * VincularGoogleUseCase — el lado `GET /api/auth/google/callback` del link
 * explícito (US-041, VINC041-02/04, CA-05, design.md §4.2/§5.2).
 *
 * **`execute({ userId, sub })` — EXACTAMENTE dos campos.** No hay sesión en
 * el callback por construcción: el estado del usuario se LEE de la fila vía
 * `buscarPorId`, nunca se pasa (design §2/D-05).
 *
 * CA-05 es estructural: el input tiene dos campos, ninguno de los cuales
 * puede contener un token de Google — no hay dónde uno pudiera persistirse
 * desde acá.
 */
export class VincularGoogleUseCase {
  constructor(
    private readonly identidades: IIdentidadGoogleRepository,
    private readonly logger: ILogger,
  ) {}

  async execute(input: {
    userId: string;
    sub: string;
  }): Promise<Result<void, VinculacionGoogleFallidaError>> {
    const fila = await this.identidades.buscarPorId(input.userId);
    this.logger.debug('vincular-google: lookup de identidad', {
      found: fila !== null,
    });

    if (fila === null) {
      return Result.fail(
        new VinculacionGoogleFallidaError('usuario-inexistente'),
      );
    }

    if (fila.googleSub === input.sub) {
      // IDEMPOTENTE — el estado deseado ya se sostiene. Sin write.
      this.logger.debug('vincular-google: estado del vínculo', {
        yaVinculadoAlMismoSub: true,
        tieneOtroSub: false,
      });
      return Result.ok(undefined);
    }

    if (fila.googleSub !== null) {
      // Un sub DISTINTO ya está en la fila — cambiar de cuenta vinculada es
      // unlink-then-link (dos transiciones auditadas), no un sobre-escritura
      // silenciosa acá.
      this.logger.debug('vincular-google: estado del vínculo', {
        yaVinculadoAlMismoSub: false,
        tieneOtroSub: true,
      });
      return Result.fail(
        new VinculacionGoogleFallidaError('ya-tiene-otro-sub'),
      );
    }

    // ★ regla (CA-02, home testeable de esta línea): tras el chequeo de
    // arriba, un match acá SOLO puede ser la identidad de OTRA cuenta.
    // NUNCA re-linkear. `googleSub @unique` es la segunda línea de defensa,
    // incondicional (el P2002 de `vincularGoogleSub` colapsa a `false`).
    const deOtraCuenta = await this.identidades.buscarPorGoogleSub(input.sub);
    if (deOtraCuenta !== null) {
      return Result.fail(
        new VinculacionGoogleFallidaError('identidad-de-otra-cuenta'),
      );
    }

    const linkeado = await this.identidades.vincularGoogleSub(
      input.userId,
      input.sub,
    );
    this.logger.debug('vincular-google: outcome del write condicional', {
      linkeado,
    });
    if (!linkeado) {
      return Result.fail(
        new VinculacionGoogleFallidaError('link-perdio-la-carrera'),
      );
    }

    return Result.ok(undefined);
  }
}
