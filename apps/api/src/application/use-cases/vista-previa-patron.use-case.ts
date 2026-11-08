import { Result } from '../../shared/result';
import { normalizarTextoPatron } from '../../domain/value-objects/patron-clasificacion';
import { PatronExistente } from '../../domain/value-objects/patron-existente';
import { CategoriaNoEncontradaError } from '../../domain/errors/categoria-no-encontrada.error';
import { CategoriaInternaProtegidaError } from '../../domain/errors/categoria-interna-protegida.error';
import { ICategoriaRepository } from '../ports/categoria-repository.port';
import { MovimientoParaAprender } from '../ports/movimientos-para-aprender.port';
import {
  PlanificadorAprendizaje,
  PlanificadorAprendizajeError,
} from '../services/planificador-aprendizaje';
import { PatronFormatoError, validarPatron } from './validar-patron';

export type VistaPreviaPatronError =
  | CategoriaNoEncontradaError
  | CategoriaInternaProtegidaError
  | PatronFormatoError
  | PlanificadorAprendizajeError;

export interface VistaPreviaPatronResult {
  readonly periodo: string;
  /** The candidate text as the engine compares it (CLA-14). */
  readonly patron: string;
  readonly coincidencias: ReadonlyArray<MovimientoParaAprender>;
  readonly existente: PatronExistente | null;
}

/**
 * VistaPreviaPatronUseCase — `POST /api/patrones/vista-previa` (CLA-15, S3).
 *
 * "La app muestra con cuántos movimientos del mes coincide y pregunta si
 * moverlos." Read only: nothing is written.
 *
 * Validation mirrors `CrearPatronUseCase` so the preview never accepts what
 * the save would reject: ownership of `categoriaId` (404) → internal
 * category (403, CLA-18) → shape of `patron` (CONTAINS, the only type the
 * app offers) → periodo. Never throws.
 */
export class VistaPreviaPatronUseCase {
  constructor(
    private readonly categoriaRepository: ICategoriaRepository,
    private readonly planificador: PlanificadorAprendizaje,
  ) {}

  async execute(input: {
    userId: string;
    categoriaId: string;
    patron: string;
    periodo?: string;
  }): Promise<Result<VistaPreviaPatronResult, VistaPreviaPatronError>> {
    const categoria = await this.categoriaRepository.buscarPorId(
      input.userId,
      input.categoriaId,
    );
    if (categoria === null) {
      return Result.fail(new CategoriaNoEncontradaError(input.categoriaId));
    }
    if (categoria.esInterna) {
      return Result.fail(
        new CategoriaInternaProtegidaError(input.categoriaId, 'patron'),
      );
    }

    const validado = validarPatron({
      patron: input.patron,
      matchType: 'CONTAINS',
    });
    if (validado.isFail()) return Result.fail(validado.getError());
    const { patron, matchType } = validado.getValue();

    const plan = await this.planificador.planificar({
      userId: input.userId,
      periodo: input.periodo,
      candidato: { patron, matchType },
      categoriaDestinoId: categoria.id,
    });
    if (plan.isFail()) return Result.fail(plan.getError());
    const { periodo, coincidencias, existente } = plan.getValue();

    return Result.ok({
      periodo: periodo.valor,
      patron: normalizarTextoPatron(patron),
      coincidencias,
      existente,
    });
  }
}
