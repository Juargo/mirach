import { Result } from '../../shared/result';
import { Bucket } from '../../domain/value-objects/bucket';
import { sugerirTextoPatron } from '../../domain/value-objects/texto-sugerido';
import { TransaccionNoEncontradaError } from '../../domain/errors/transaccion-no-encontrada.error';
import { CategoriaDesconocidaError } from '../../domain/errors/categoria-desconocida.error';
import { CategoriaInternaProtegidaError } from '../../domain/errors/categoria-interna-protegida.error';
import { PatronInvalidoError } from '../../domain/errors/patron-invalido.error';
import { ICategoriaRepository } from '../ports/categoria-repository.port';
import { IMovimientosParaAprenderReader } from '../ports/movimientos-para-aprender.port';
import {
  AccionPatron,
  AprendizajeClasificacionWriterError,
  IAprendizajeClasificacionWriter,
} from '../ports/aprendizaje-clasificacion-writer.port';
import {
  PlanificadorAprendizaje,
  PlanificadorAprendizajeError,
} from '../services/planificador-aprendizaje';
import { PatronFormatoError, validarPatron } from './validar-patron';

export type ReclasificarConParecidosError =
  | TransaccionNoEncontradaError
  | CategoriaDesconocidaError
  | CategoriaInternaProtegidaError
  | PatronFormatoError
  | PlanificadorAprendizajeError
  | AprendizajeClasificacionWriterError;

export interface ReclasificarConParecidosResult {
  readonly id: string;
  readonly categoriaId: string;
  /** Category name. */
  readonly categoria: string;
  readonly bucket: Bucket;
  /** OTHER movements of the periodo moved with the suggested pattern. */
  readonly movidos: number;
}

/**
 * ReclasificarConParecidosUseCase — `PATCH /api/transacciones/{id}/categoria`
 * with `aplicarAParecidos` (CLA-03: "La app ofrece aplicar el cambio a
 * movimientos parecidos y lo usa en las próximas cartolas"; S6).
 *
 * In ONE transaction (`IAprendizajeClasificacionWriter`):
 *   - reclassifies the movement by hand (`clasificacionManual`, as today);
 *   - creates the suggested pattern in the chosen category, or moves the
 *     existing one there (CLA-17), or keeps it when it already lives there;
 *   - moves the OTHER coinciding rows of the periodo (S2).
 *
 * Errors keep the plain PATCH's contract where they overlap: a category that
 * is not the caller's is `CategoriaDesconocidaError` (400) and a foreign
 * movement is `TransaccionNoEncontradaError` (404). An internal category is
 * refused (403, CLA-18) and a glosa with no suggestion is
 * `PatronInvalidoError` (400) instead of silently dropping the option.
 * Nothing is written on any error. Never throws.
 */
export class ReclasificarConParecidosUseCase {
  constructor(
    private readonly reader: IMovimientosParaAprenderReader,
    private readonly categoriaRepository: ICategoriaRepository,
    private readonly planificador: PlanificadorAprendizaje,
    private readonly writer: IAprendizajeClasificacionWriter,
  ) {}

  async execute(input: {
    userId: string;
    transaccionId: string;
    categoriaId: string;
    periodo: string;
  }): Promise<
    Result<ReclasificarConParecidosResult, ReclasificarConParecidosError>
  > {
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
      return Result.fail(new CategoriaDesconocidaError(input.categoriaId));
    }
    if (categoria.esInterna) {
      return Result.fail(
        new CategoriaInternaProtegidaError(input.categoriaId, 'patron'),
      );
    }

    const texto = sugerirTextoPatron(movimiento.descripcion);
    if (texto === null) {
      // Never the glosa: `rawValue` is logged and descripcion is sensitive.
      return Result.fail(new PatronInvalidoError(''));
    }
    const validado = validarPatron({ patron: texto, matchType: 'CONTAINS' });
    if (validado.isFail()) return Result.fail(validado.getError());
    const { patron, matchType, prioridad } = validado.getValue();

    const plan = await this.planificador.planificar({
      userId: input.userId,
      periodo: input.periodo,
      candidato: { patron, matchType },
      categoriaDestinoId: categoria.id,
      excluirIds: [movimiento.id],
    });
    if (plan.isFail()) return Result.fail(plan.getError());
    const { coincidencias, existente } = plan.getValue();

    const accion: AccionPatron =
      existente === null
        ? { tipo: 'crear', patron, matchType, prioridad }
        : existente.categoriaId === categoria.id
          ? { tipo: 'mantener', patronId: existente.patronId }
          : { tipo: 'mover', patronId: existente.patronId };

    const escrito = await this.writer.aplicar(input.userId, {
      categoriaId: categoria.id,
      reclasificarTransaccionId: movimiento.id,
      patron: accion,
      moverTransaccionIds: coincidencias.map((m) => m.id),
    });
    if (escrito.isFail()) return Result.fail(escrito.getError());
    const { categoria: destino, movidos } = escrito.getValue();

    return Result.ok({
      id: movimiento.id,
      categoriaId: destino.id,
      categoria: destino.nombre,
      bucket: destino.bucket,
      movidos,
    });
  }
}
