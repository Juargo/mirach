import { Result } from '../../shared/result';
import { ICategoriaRepository } from '../ports/categoria-repository.port';
import { CatalogoDemoSoloLecturaError } from '../../domain/errors/catalogo-demo-solo-lectura.error';
import { CategoriaNoEncontradaError } from '../../domain/errors/categoria-no-encontrada.error';
import { CategoriaInternaProtegidaError } from '../../domain/errors/categoria-interna-protegida.error';
import { seleccionarCategoriaInterna } from '../services/categoria-por-defecto';

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
 *
 * #778 tramo 3 — el destino de la reasignación se resuelve ACÁ, después del
 * gate `esInterna` y antes del delete: cargamos el catálogo completo del
 * usuario y buscamos, con `seleccionarCategoriaInterna`, la `Desconocido`
 * del MISMO bucket que `actual` (nunca `BUCKET_POR_DEFECTO` — ver el
 * docblock de esa función). El orden de gates NO cambia: "esta fila no se
 * muta" (demo → 404 → interna) sigue precediendo a cualquier otra cosa.
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

    const catalogo = await this.categoriaRepository.listarConPatrones(
      input.userId,
    );
    const desconocidoDelBucket = seleccionarCategoriaInterna(
      catalogo,
      actual.bucket,
    );
    // Sin logger inyectado en este use case: agregar uno solo por este log
    // sería una dependencia nueva no pedida por el spec (YAGNI). Si
    // `desconocidoDelBucket` es null, el catálogo del usuario no tiene una
    // `Desconocido` en este bucket (dato faltante, no debería pasar en un
    // catálogo seedeado) y el borrado degrada al SetNull histórico — se
    // remedia corriendo `prisma/backfill-catalogo-faltante.ts --user <id>`.

    return this.categoriaRepository.eliminar(
      input.userId,
      input.id,
      desconocidoDelBucket?.id ?? null,
    );
  }
}
