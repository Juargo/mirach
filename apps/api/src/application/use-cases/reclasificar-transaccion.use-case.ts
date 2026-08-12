import { Result } from '../../shared/result';
import { TransaccionNoEncontradaError } from '../../domain/errors/transaccion-no-encontrada.error';
import { CategoriaDesconocidaError } from '../../domain/errors/categoria-desconocida.error';
import {
  IReclasificarCategoriaWriter,
  ReclasificarCategoriaResult,
} from '../ports/reclasificar-categoria.port';

/**
 * ReclasificarTransaccionUseCase — use case de escritura para la
 * reclasificación manual de una transacción (US-013, CATAPI-01/02/03/04;
 * CAT037-04, ADR-037/Q5).
 *
 * Se reduce a un delegado puro: pasa `nombre` al writer sin ningún gating de
 * enum (`CATEGORIAS_VALIDAS` / `CATEGORIA_BUCKET` — ambos retirados con el
 * enum `Categoria`). El writer resuelve el nombre contra el catálogo REAL
 * del usuario y deriva el bucket; el use case solo mapea el resultado. Thin
 * coordinator — mirrors ObtenerDetalleBucketUseCase. Nunca lanza.
 */
export class ReclasificarTransaccionUseCase {
  constructor(private readonly writer: IReclasificarCategoriaWriter) {}

  async execute(input: {
    userId: string;
    transaccionId: string;
    categoria: string; // raw body field, resuelto por el writer
  }): Promise<
    Result<
      ReclasificarCategoriaResult,
      CategoriaDesconocidaError | TransaccionNoEncontradaError
    >
  > {
    return this.writer.reasignar(
      input.userId,
      input.transaccionId,
      input.categoria,
    );
  }
}
