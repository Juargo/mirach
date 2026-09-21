import { Result } from '../../shared/result';
import { ICategoriaRepository } from '../ports/categoria-repository.port';
import { CatalogoDemoSoloLecturaError } from '../../domain/errors/catalogo-demo-solo-lectura.error';
import { CategoriaNoEncontradaError } from '../../domain/errors/categoria-no-encontrada.error';
import { CategoriaInternaProtegidaError } from '../../domain/errors/categoria-interna-protegida.error';

export type EliminarCategoriaError =
  | CatalogoDemoSoloLecturaError
  | CategoriaNoEncontradaError
  | CategoriaInternaProtegidaError;

/**
 * EliminarCategoriaUseCase — use case de escritura para
 * `DELETE /api/categorias/:id` (US-038/US-039, CAT038-04 as modified).
 *
 * El delete SIEMPRE succeeds para una categoría del caller, esté o no en
 * uso — no hay rechazo por "en uso" (US-039 retiró ese `409`). Las
 * transacciones que referenciaban la categoría sobreviven con
 * `categoriaId: null`; su `bucketId` nunca se toca, así que borrar una
 * categoría no mueve dinero entre buckets (CAT038-04, CA-04).
 *
 * La ÚNICA excepción es una categoría INTERNA del sistema (#778): existe
 * porque el producto la necesita, no porque el usuario la haya creado, así
 * que no es suya para borrar.
 *
 * Ese gate obliga a una LECTURA PREVIA que este use case no hacía: antes
 * delegaba el delete a ciegas y dejaba que el `WHERE {id, userId}` del
 * adapter resolviera la pertenencia. Ahora hay que mirar la fila para saber
 * si está protegida, y esa lectura trae el 404 de regalo.
 *
 * No es una carrera nueva: entre el `buscarPorId` y el `eliminar` la fila
 * podría desaparecer, pero el adapter sigue devolviendo
 * `CategoriaNoEncontradaError` en ese caso — el mismo error que devolvería
 * esta lectura, así que el resultado observable no cambia. Lo que NO puede
 * pasar es lo inverso (que una fila se vuelva interna entre las dos
 * llamadas): `esInterna` solo se escribe al materializar un catálogo nuevo.
 *
 * La mecánica del delete (children-first, composite FK) sigue viviendo en el
 * adapter (`PrismaCategoriaRepository#eliminar`, design.md Q4). Nunca lanza.
 */
export class EliminarCategoriaUseCase {
  constructor(private readonly categoriaRepository: ICategoriaRepository) {}

  async execute(input: {
    userId: string;
    esDemo: boolean;
    id: string;
  }): Promise<Result<void, EliminarCategoriaError>> {
    if (input.esDemo) {
      return Result.fail(new CatalogoDemoSoloLecturaError());
    }

    const actual = await this.categoriaRepository.buscarPorId(
      input.userId,
      input.id,
    );
    if (actual === null) {
      return Result.fail(new CategoriaNoEncontradaError(input.id));
    }
    if (actual.esInterna) {
      return Result.fail(new CategoriaInternaProtegidaError(input.id));
    }

    return this.categoriaRepository.eliminar(input.userId, input.id);
  }
}
