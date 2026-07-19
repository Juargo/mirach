import { Result } from '../../shared/result';
import { Categoria, CATEGORIA_BUCKET } from '../../domain/value-objects/categoria';
import { CategoriaInvalidaError } from '../../domain/errors/categoria-invalida.error';
import { TransaccionNoEncontradaError } from '../../domain/errors/transaccion-no-encontrada.error';
import {
  IReclasificarCategoriaWriter,
  ReclasificarCategoriaResult,
} from '../ports/reclasificar-categoria.port';

const CATEGORIAS_VALIDAS: ReadonlySet<string> = new Set(Object.values(Categoria));

/**
 * ReclasificarTransaccionUseCase — use case de escritura para la
 * reclasificación manual de una transacción (US-013, CATAPI-01/02/03/04).
 *
 * Orquesta: 1) valida la categoría cruda contra el enum; 2) DERIVA el bucket
 * vía CATEGORIA_BUCKET — nunca lo acepta del caller, así el invariante
 * "bucket === categoria.bucket" se sostiene por construcción (design.md §2);
 * 3) delega la escritura userId-isolated al writer. Thin coordinator —
 * mirrors ObtenerDetalleBucketUseCase. Nunca lanza.
 */
export class ReclasificarTransaccionUseCase {
  constructor(private readonly writer: IReclasificarCategoriaWriter) {}

  async execute(input: {
    userId: string;
    transaccionId: string;
    categoria: string; // raw body field
  }): Promise<
    Result<ReclasificarCategoriaResult, CategoriaInvalidaError | TransaccionNoEncontradaError>
  > {
    // 1. Validate categoría against the enum first — writer is never invoked
    //    with an unknown value.
    if (!CATEGORIAS_VALIDAS.has(input.categoria)) {
      return Result.fail(new CategoriaInvalidaError(input.categoria));
    }
    const categoria = input.categoria as Categoria;

    // 2. Derive the bucket — never accept it. Invariant holds by construction.
    const bucket = CATEGORIA_BUCKET[categoria];

    // 3. userId-isolated single-row write; not-found/not-owned merged 404.
    return this.writer.reasignar(input.userId, input.transaccionId, categoria, bucket);
  }
}
