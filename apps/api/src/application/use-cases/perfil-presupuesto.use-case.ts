import { Result } from '../../shared/result';
import {
  MetasPresupuesto,
  PERFIL_PERSONALIZADO,
  PerfilPredefinidoId,
  PerfilPresupuesto,
} from '../../domain/value-objects/perfil-presupuesto';
import { PerfilNoSuma100Error } from '../../domain/errors/perfil-no-suma-100.error';
import { MetaPresupuestoInvalidaError } from '../../domain/errors/meta-presupuesto-invalida.error';
import {
  IPerfilPresupuestoReader,
  IPerfilPresupuestoRepository,
} from '../ports/perfil-presupuesto.port';
import { ILogger } from '../ports/logger.port';

/**
 * ObtenerPerfilPresupuestoUseCase — `GET /api/perfil/presupuesto` (#110).
 * Never fails: a user who never chose a profile has 50/30/20.
 */
export class ObtenerPerfilPresupuestoUseCase {
  constructor(private readonly reader: IPerfilPresupuestoReader) {}

  async execute(input: {
    userId: string;
  }): Promise<Result<PerfilPresupuesto, never>> {
    return Result.ok(await this.reader.obtener(input.userId));
  }
}

export type ActualizarPerfilPresupuestoError =
  PerfilNoSuma100Error | MetaPresupuestoInvalidaError;

/** Input of the update: a predefined id, or the custom profile with goals. */
export type ActualizarPerfilPresupuestoInput =
  | { readonly userId: string; readonly perfil: PerfilPredefinidoId }
  | {
      readonly userId: string;
      readonly perfil: typeof PERFIL_PERSONALIZADO;
      readonly metas: MetasPresupuesto;
    };

/**
 * ActualizarPerfilPresupuestoUseCase — `PUT /api/perfil/presupuesto` (#110,
 * PER-03..PER-05). An invalid custom profile is rejected before anything is
 * written, so the stored profile does not change. The custom profile is
 * allowed for every plan until ADR-012 gates it (S6).
 */
export class ActualizarPerfilPresupuestoUseCase {
  constructor(
    private readonly repo: IPerfilPresupuestoRepository,
    private readonly logger: ILogger,
  ) {}

  async execute(
    input: ActualizarPerfilPresupuestoInput,
  ): Promise<Result<PerfilPresupuesto, ActualizarPerfilPresupuestoError>> {
    let perfil: PerfilPresupuesto;
    if (input.perfil === PERFIL_PERSONALIZADO) {
      const creado = PerfilPresupuesto.personalizado(input.metas);
      if (creado.isFail()) {
        this.logger.debug('actualizar-perfil-presupuesto: rejected', {
          userId: input.userId,
          error: creado.getError().name,
        });
        return Result.fail(creado.getError());
      }
      perfil = creado.getValue();
    } else {
      perfil = PerfilPresupuesto.predefinido(input.perfil);
    }

    await this.repo.guardar(input.userId, perfil);
    // Profile id only — never the goals of a custom profile or any amount.
    this.logger.debug('actualizar-perfil-presupuesto: saved', {
      userId: input.userId,
      perfil: perfil.perfil,
    });
    return Result.ok(perfil);
  }
}
