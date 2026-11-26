import { Result } from '../../shared/result';
import {
  MetasPresupuesto,
  PERFIL_PERSONALIZADO,
  PerfilPredefinidoId,
  PerfilPresupuesto,
} from '../../domain/value-objects/perfil-presupuesto';
import { PerfilNoSuma100Error } from '../../domain/errors/perfil-no-suma-100.error';
import { MetaPresupuestoInvalidaError } from '../../domain/errors/meta-presupuesto-invalida.error';
import { DiaCorteInvalidoError } from '../../domain/errors/dia-corte-invalido.error';
import { IngresoDeclaradoInvalidoError } from '../../domain/errors/ingreso-declarado-invalido.error';
import { MesFinanciero } from '../../domain/value-objects/mes-financiero';
import {
  IPerfilPresupuestoReader,
  IPerfilPresupuestoRepository,
} from '../ports/perfil-presupuesto.port';
import { ILogger } from '../ports/logger.port';
import type { IVerificadorPlus } from '../ports/verificador-plus.port';
import { PlanPlusRequeridoError } from '../../domain/errors/plan-plus-requerido.error';
import { Bucket } from '../../domain/value-objects/bucket';

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
  | PlanPlusRequeridoError
  | PerfilNoSuma100Error
  | MetaPresupuestoInvalidaError
  | DiaCorteInvalidoError
  | IngresoDeclaradoInvalidoError;

/**
 * Financial month fields of the update (#111). Left out = unchanged;
 * `ingresoDeclarado: null` clears the declared income.
 */
interface MesFinancieroInput {
  readonly diaCorte?: number;
  readonly ingresoDeclarado?: bigint | null;
}

/** Input of the update: a predefined id, or the custom profile with goals. */
export type ActualizarPerfilPresupuestoInput = MesFinancieroInput &
  (
    | { readonly userId: string; readonly perfil: PerfilPredefinidoId }
    | {
        readonly userId: string;
        readonly perfil: typeof PERFIL_PERSONALIZADO;
        readonly metas: MetasPresupuesto;
      }
  );

const BUCKETS_CON_META = [
  Bucket.Necesidades,
  Bucket.Deseos,
  Bucket.Ahorro,
] as const;

/** Same profile id and the same three goals. */
function mismoPerfil(a: PerfilPresupuesto, b: PerfilPresupuesto): boolean {
  return (
    a.perfil === b.perfil &&
    BUCKETS_CON_META.every((bucket) => a.metas[bucket] === b.metas[bucket])
  );
}

/**
 * ActualizarPerfilPresupuestoUseCase — `PUT /api/perfil/presupuesto` (#110,
 * PER-03..PER-05). An invalid custom profile is rejected before anything is
 * written, so the stored profile does not change. A custom profile is Plus
 * (PLA-01): a free account may keep the custom profile it already has, for
 * instance to change its cut-off day, but not set new goals. The cut-off day and
 * declared income (#111) live in the same resource; a field left out keeps
 * its stored value.
 */
export class ActualizarPerfilPresupuestoUseCase {
  constructor(
    private readonly repo: IPerfilPresupuestoRepository,
    private readonly logger: ILogger,
    private readonly plus: IVerificadorPlus,
  ) {}

  async execute(
    input: ActualizarPerfilPresupuestoInput,
  ): Promise<Result<PerfilPresupuesto, ActualizarPerfilPresupuestoError>> {
    const metas =
      input.perfil === PERFIL_PERSONALIZADO
        ? PerfilPresupuesto.personalizado(input.metas)
        : Result.ok(PerfilPresupuesto.predefinido(input.perfil));
    if (metas.isFail()) return this.rechazar(input.userId, metas.getError());

    const guardado = await this.repo.obtener(input.userId);
    if (
      input.perfil === PERFIL_PERSONALIZADO &&
      !mismoPerfil(guardado, metas.getValue()) &&
      !(await this.plus.tienePlus(input.userId))
    ) {
      return this.rechazar(input.userId, new PlanPlusRequeridoError());
    }

    const actual = guardado.mesFinanciero;
    const mes = MesFinanciero.crear(
      input.diaCorte ?? actual.diaCorte.valor,
      input.ingresoDeclarado === undefined
        ? actual.ingresoDeclarado
        : input.ingresoDeclarado,
    );
    if (mes.isFail()) return this.rechazar(input.userId, mes.getError());

    const perfil = metas.getValue().conMesFinanciero(mes.getValue());

    await this.repo.guardar(input.userId, perfil);
    // Profile id only — never the goals of a custom profile or any amount.
    this.logger.debug('actualizar-perfil-presupuesto: saved', {
      userId: input.userId,
      perfil: perfil.perfil,
    });
    return Result.ok(perfil);
  }

  private rechazar(
    userId: string,
    error: ActualizarPerfilPresupuestoError,
  ): Result<never, ActualizarPerfilPresupuestoError> {
    this.logger.debug('actualizar-perfil-presupuesto: rejected', {
      userId,
      error: error.name,
    });
    return Result.fail(error);
  }
}
