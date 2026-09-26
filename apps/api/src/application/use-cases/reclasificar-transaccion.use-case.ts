import { Result } from '../../shared/result';
import { TransaccionNoEncontradaError } from '../../domain/errors/transaccion-no-encontrada.error';
import { CategoriaDesconocidaError } from '../../domain/errors/categoria-desconocida.error';
import { ReclasificarDemoSoloLecturaError } from '../../domain/errors/reclasificar-demo-solo-lectura.error';
import {
  IReclasificarCategoriaWriter,
  ReclasificarCategoriaResult,
} from '../ports/reclasificar-categoria.port';

/** Unión de errores de `ReclasificarTransaccionUseCase`. */
export type ReclasificarTransaccionError =
  | ReclasificarDemoSoloLecturaError
  | CategoriaDesconocidaError
  | TransaccionNoEncontradaError;

/**
 * ReclasificarTransaccionUseCase — use case de escritura para la
 * reclasificación manual de una transacción (US-013, CATAPI-01/02/03/04;
 * CAT037-04, ADR-037/Q5, ADR-042).
 *
 * Se reduce a un delegado puro: pasa `categoriaId` al writer sin ningún
 * gating de enum (`CATEGORIAS_VALIDAS` / `CATEGORIA_BUCKET` — ambos
 * retirados con el enum `Categoria`). El writer resuelve el id contra el
 * catálogo REAL del usuario y deriva el bucket; el use case solo mapea el
 * resultado. Thin coordinator — mirrors ObtenerDetalleBucketUseCase. Nunca
 * lanza.
 *
 * Demo gate (issue #597): una sesión demo corta ANTES de tocar el writer —
 * mismo patrón que `EliminarMovimientoManualUseCase`/
 * `ReevaluarCategoriasUseCase`. Esta era la única escritura del área de
 * catálogo/movimientos sin el gate.
 */
export class ReclasificarTransaccionUseCase {
  constructor(private readonly writer: IReclasificarCategoriaWriter) {}

  async execute(input: {
    userId: string;
    transaccionId: string;
    categoriaId: string; // raw body field, resuelto por el writer
    /** Demo gate — una sesión demo no puede escribir. */
    esDemo: boolean;
  }): Promise<
    Result<ReclasificarCategoriaResult, ReclasificarTransaccionError>
  > {
    if (input.esDemo) {
      return Result.fail(new ReclasificarDemoSoloLecturaError());
    }

    return this.writer.reasignar(
      input.userId,
      input.transaccionId,
      input.categoriaId,
    );
  }
}
