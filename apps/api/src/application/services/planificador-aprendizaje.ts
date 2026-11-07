import { Result } from '../../shared/result';
import { MatchType } from '../../domain/value-objects/patron-clasificacion';
import { PeriodoMes } from '../../domain/value-objects/periodo-mes';
import {
  PatronExistente,
  aPatronExistente,
  buscarPatronPorTexto,
} from '../../domain/value-objects/patron-existente';
import { PeriodoInvalidoError } from '../../domain/errors/periodo-invalido.error';
import { CategorizacionFallidaError } from '../../domain/errors/categorizacion-fallida.error';
import { ICatalogoClasificacion } from '../ports/catalogo-clasificacion.port';
import {
  IMovimientosParaAprenderReader,
  MovimientoParaAprender,
} from '../ports/movimientos-para-aprender.port';
import { IPerfilPresupuestoReader } from '../ports/perfil-presupuesto.port';
import { IUltimoPeriodoConDatosReader } from '../ports/ultimo-periodo-con-datos.port';
import { CategorizarTransaccionUseCase } from '../use-cases/categorizar-transaccion.use-case';
import { resolverPeriodo } from '../use-cases/resolver-periodo';
import { seleccionarMovimientosCoincidentes } from './movimientos-coincidentes';

export type PlanificadorAprendizajeError =
  PeriodoInvalidoError | CategorizacionFallidaError;

/** What a candidate pattern would do to one financial month (S2, S3). */
export interface PlanAprendizaje {
  readonly periodo: PeriodoMes;
  /** The movements of the periodo the candidate would win (S2). */
  readonly coincidencias: ReadonlyArray<MovimientoParaAprender>;
  /** The pattern that already holds the text (CLA-17), or null. */
  readonly existente: PatronExistente | null;
}

/**
 * PlanificadorAprendizaje — the read side shared by the preview (S3), the
 * save with move (S4) and the reclassify-and-apply flow (S6): resolve the
 * periodo under the person's `DiaCorte`, load their catalog and the
 * movements of that financial month, and select the coinciding ones with
 * `seleccionarMovimientosCoincidentes`. One place, so the preview count and
 * the rows that actually move never diverge.
 */
export class PlanificadorAprendizaje {
  constructor(
    private readonly catalogo: ICatalogoClasificacion,
    private readonly reader: IMovimientosParaAprenderReader,
    private readonly perfilReader: IPerfilPresupuestoReader,
    private readonly ultimoPeriodoReader: IUltimoPeriodoConDatosReader,
    private readonly categorizar: CategorizarTransaccionUseCase,
  ) {}

  async planificar(input: {
    readonly userId: string;
    /** `undefined` ⇒ resolves like every monthly read (`resolverPeriodo`). */
    readonly periodo: string | undefined;
    readonly candidato: {
      readonly patron: string;
      readonly matchType: MatchType;
    };
    readonly categoriaDestinoId: string;
    readonly excluirIds?: ReadonlyArray<string>;
  }): Promise<Result<PlanAprendizaje, PlanificadorAprendizajeError>> {
    const perfil = await this.perfilReader.obtener(input.userId);
    const periodoResult = await resolverPeriodo(
      this.ultimoPeriodoReader,
      input.userId,
      input.periodo,
      perfil.mesFinanciero.diaCorte,
    );
    if (periodoResult.isFail()) return Result.fail(periodoResult.getError());
    const periodo = periodoResult.getValue();

    const catalogoResult = await this.catalogo.findAll(input.userId);
    if (catalogoResult.isFail()) return Result.fail(catalogoResult.getError());
    const patrones = catalogoResult.getValue();

    const movimientos = await this.reader.buscarDelPeriodo(
      input.userId,
      periodo,
    );
    const coincidencias = seleccionarMovimientosCoincidentes({
      categorizar: this.categorizar,
      patrones,
      candidato: input.candidato,
      categoriaDestinoId: input.categoriaDestinoId,
      movimientos,
      excluirIds: input.excluirIds,
    });
    const existente = buscarPatronPorTexto(patrones, input.candidato.patron);

    return Result.ok({
      periodo,
      coincidencias,
      existente: existente === undefined ? null : aPatronExistente(existente),
    });
  }
}
