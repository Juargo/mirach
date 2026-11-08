import { Result } from '../../shared/result';
import { ICategoriaRepository } from '../ports/categoria-repository.port';
import { IPatronRepository, Patron } from '../ports/patron-repository.port';
import { CategoriaNoEncontradaError } from '../../domain/errors/categoria-no-encontrada.error';
import { CategoriaInternaProtegidaError } from '../../domain/errors/categoria-interna-protegida.error';
import { PatronInvalidoError } from '../../domain/errors/patron-invalido.error';
import { MatchTypeInvalidoError } from '../../domain/errors/match-type-invalido.error';
import { RegexInvalidaError } from '../../domain/errors/regex-invalida.error';
import { PrioridadInvalidaError } from '../../domain/errors/prioridad-invalida.error';
import { PatronDuplicadoError } from '../../domain/errors/patron-duplicado.error';
import { CategoriaDesconocidaError } from '../../domain/errors/categoria-desconocida.error';
import {
  AprendizajeClasificacionWriterError,
  IAprendizajeClasificacionWriter,
} from '../ports/aprendizaje-clasificacion-writer.port';
import {
  PlanificadorAprendizaje,
  PlanificadorAprendizajeError,
} from '../services/planificador-aprendizaje';
import { validarPatron } from './validar-patron';

export type CrearPatronError =
  | CategoriaNoEncontradaError
  | CategoriaInternaProtegidaError
  | PatronInvalidoError
  | MatchTypeInvalidoError
  | RegexInvalidaError
  | PrioridadInvalidaError
  | PatronDuplicadoError
  | PlanificadorAprendizajeError
  | Exclude<AprendizajeClasificacionWriterError, CategoriaDesconocidaError>;

export interface CrearPatronResult {
  readonly patron: Patron;
  /** Rows of `moverDelPeriodo` moved to the category; 0 without it (S4). */
  readonly movidos: number;
}

/**
 * CrearPatronUseCase — use case de escritura para `POST /api/patrones`
 * (US-038, CAT038-05/06).
 *
 * Orden de validación (design.md §5.1/§5.2, mirrors CrearPatronError union):
 *   ownership de `categoriaId` (404) → forma de `patron` →
 *   `matchType` ∈ set → si REGEX, compila → `prioridad` (default 100,
 *   rango 1..999) → unicidad de `patron` por usuario, sin mayúsculas ni tildes (CLA-17) →
 *   creación.
 *
 * `moverDelPeriodo` (CLA-15, S4): con el período, crear el patrón y mover
 * los movimientos coincidentes de ese mes (S2) ocurre en UNA transacción
 * (ADR-004:49) vía `IAprendizajeClasificacionWriter`. Sin el período, nada
 * se mueve: "el patrón solo se usa en las próximas cartolas" (`movidos: 0`).
 *
 * El chequeo de escritura de REGEX es un gate MÁS TEMPRANO y amigable —
 * NUNCA reemplaza el `try/catch` de `coincide()`, que sigue degradando
 * cualquier patrón malformado preexistente a no-match (CA-05). Nunca lanza.
 */
export class CrearPatronUseCase {
  constructor(
    private readonly categoriaRepository: ICategoriaRepository,
    private readonly patronRepository: IPatronRepository,
    private readonly planificador: PlanificadorAprendizaje,
    private readonly writer: IAprendizajeClasificacionWriter,
  ) {}

  async execute(input: {
    userId: string;
    categoriaId: string;
    patron: string;
    matchType: string;
    prioridad?: number;
    /** Financial month YYYY-MM whose coinciding rows move with the save. */
    moverDelPeriodo?: string;
  }): Promise<Result<CrearPatronResult, CrearPatronError>> {
    const categoria = await this.categoriaRepository.buscarPorId(
      input.userId,
      input.categoriaId,
    );
    if (categoria === null) {
      return Result.fail(new CategoriaNoEncontradaError(input.categoriaId));
    }
    // CLA-18: "Desconocido" (interna) recibe lo que no coincide con ningún
    // patrón, así que no puede tener patrones propios.
    if (categoria.esInterna) {
      return Result.fail(
        new CategoriaInternaProtegidaError(input.categoriaId, 'patron'),
      );
    }

    const validado = validarPatron({
      patron: input.patron,
      matchType: input.matchType,
      prioridad: input.prioridad,
    });
    if (validado.isFail()) {
      return Result.fail(validado.getError());
    }
    const { patron, matchType, prioridad } = validado.getValue();

    const existente = await this.patronRepository.buscarPorTexto(
      input.userId,
      patron,
    );
    if (existente !== null) {
      return Result.fail(new PatronDuplicadoError(patron, existente));
    }

    if (input.moverDelPeriodo === undefined) {
      const nuevo = await this.patronRepository.crear(input.userId, {
        categoriaId: input.categoriaId,
        patron,
        matchType,
        prioridad,
      });
      return Result.ok({ patron: nuevo, movidos: 0 });
    }

    const plan = await this.planificador.planificar({
      userId: input.userId,
      periodo: input.moverDelPeriodo,
      candidato: { patron, matchType },
      categoriaDestinoId: input.categoriaId,
    });
    if (plan.isFail()) return Result.fail(plan.getError());

    const escrito = await this.writer.aplicar(input.userId, {
      categoriaId: input.categoriaId,
      patron: { tipo: 'crear', patron, matchType, prioridad },
      moverTransaccionIds: plan.getValue().coincidencias.map((m) => m.id),
    });
    if (escrito.isFail()) {
      const error = escrito.getError();
      // The category was deleted between the check and the write.
      return Result.fail(
        error instanceof CategoriaDesconocidaError
          ? new CategoriaNoEncontradaError(input.categoriaId)
          : error,
      );
    }
    const { patron: creado, movidos } = escrito.getValue();
    return Result.ok({ patron: creado, movidos });
  }
}
