import { Result } from '../../shared/result';
import { sugerirTextoPatron } from '../../domain/value-objects/texto-sugerido';
import { PatronExistente } from '../../domain/value-objects/patron-existente';
import { TransaccionNoEncontradaError } from '../../domain/errors/transaccion-no-encontrada.error';
import { CategoriaNoEncontradaError } from '../../domain/errors/categoria-no-encontrada.error';
import { ICategoriaRepository } from '../ports/categoria-repository.port';
import { IMovimientosParaAprenderReader } from '../ports/movimientos-para-aprender.port';
import {
  PlanificadorAprendizaje,
  PlanificadorAprendizajeError,
} from '../services/planificador-aprendizaje';

export type ObtenerParecidosError =
  | TransaccionNoEncontradaError
  | CategoriaNoEncontradaError
  | PlanificadorAprendizajeError;

export interface ParecidosResult {
  /** Suggested CONTAINS text (S1), or null when there is none to offer. */
  readonly patron: string | null;
  /** OTHER movements of the periodo the suggestion would move (S2). */
  readonly total: number;
  readonly existente: PatronExistente | null;
}

const SIN_SUGERENCIA: ParecidosResult = {
  patron: null,
  total: 0,
  existente: null,
};

/**
 * ObtenerParecidosUseCase — `GET /api/transacciones/{id}/parecidos`
 * (CLA-03, S6): "Before saving, the sheet asks the API for the suggested
 * text and how many other movements of the periodo would coincide."
 *
 * Read only. 404 when the movement or the category is not the caller's.
 * No suggestion (`patron: null`) when the glosa leaves fewer than 3 letters
 * (S1) or the category is internal: "Desconocido" holds no patterns (CLA-18),
 * so there is nothing to apply. Never throws.
 */
export class ObtenerParecidosUseCase {
  constructor(
    private readonly reader: IMovimientosParaAprenderReader,
    private readonly categoriaRepository: ICategoriaRepository,
    private readonly planificador: PlanificadorAprendizaje,
  ) {}

  async execute(input: {
    userId: string;
    transaccionId: string;
    categoriaId: string;
    periodo?: string;
  }): Promise<Result<ParecidosResult, ObtenerParecidosError>> {
    const movimiento = await this.reader.buscarPorId(
      input.userId,
      input.transaccionId,
    );
    if (movimiento === null) {
      return Result.fail(new TransaccionNoEncontradaError(input.transaccionId));
    }
    const categoria = await this.categoriaRepository.buscarPorId(
      input.userId,
      input.categoriaId,
    );
    if (categoria === null) {
      return Result.fail(new CategoriaNoEncontradaError(input.categoriaId));
    }
    if (categoria.esInterna) return Result.ok(SIN_SUGERENCIA);

    const texto = sugerirTextoPatron(movimiento.descripcion);
    if (texto === null) return Result.ok(SIN_SUGERENCIA);

    const plan = await this.planificador.planificar({
      userId: input.userId,
      periodo: input.periodo,
      candidato: { patron: texto, matchType: 'CONTAINS' },
      categoriaDestinoId: categoria.id,
      excluirIds: [movimiento.id],
    });
    if (plan.isFail()) return Result.fail(plan.getError());

    return Result.ok({
      patron: texto,
      total: plan.getValue().coincidencias.length,
      existente: plan.getValue().existente,
    });
  }
}
