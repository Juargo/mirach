import { Result } from '../../shared/result';
import {
  CategoriaConPatrones,
  ICategoriaRepository,
} from '../ports/categoria-repository.port';
import { CatalogoDemoSoloLecturaError } from '../../domain/errors/catalogo-demo-solo-lectura.error';
import { NombreCategoriaInvalidoError } from '../../domain/errors/nombre-categoria-invalido.error';
import { BucketNoAsignableError } from '../../domain/errors/bucket-no-asignable.error';
import { NombreCategoriaDuplicadoError } from '../../domain/errors/nombre-categoria-duplicado.error';
import { CategoriaNoEncontradaError } from '../../domain/errors/categoria-no-encontrada.error';

const NOMBRE_MIN = 1;
const NOMBRE_MAX = 40;

/** Buckets asignables — ver crear-categoria.use-case.ts (misma regla, `bucket.ts` intocado). */
const BUCKETS_ASIGNABLES = ['Necesidades', 'Deseos', 'Ahorro'] as const;

export type ActualizarCategoriaError =
  | CatalogoDemoSoloLecturaError
  | CategoriaNoEncontradaError
  | NombreCategoriaInvalidoError
  | BucketNoAsignableError
  | NombreCategoriaDuplicadoError;

/**
 * ActualizarCategoriaUseCase — use case de escritura para
 * `PATCH /api/categorias/:id` (US-038, CAT038-03).
 *
 * Body PARCIAL (Q4): `nombre` y `bucket` son ambos opcionales, al menos uno
 * presente — la regla de "al menos un campo" la exige el schema Zod
 * (transporte), no este use case.
 *
 * Orden de validación, EXACTO por design.md §3.2:
 *   1. demo gate
 *   2. 404 si la fila no es del caller (ANTES de validar cualquier campo)
 *   3. `nombre`? → forma + unicidad case-insensitive EXCLUYENDO la propia fila
 *   4. `bucket`? → asignabilidad
 *   5. arma el patch — `bucket` se incluye SOLO si el bucket cambió (D-07,
 *      el mecanismo que dispara el re-stamp en infraestructura sin un flag)
 *   6. delega en el repositorio
 *
 * Nunca lanza.
 */
export class ActualizarCategoriaUseCase {
  constructor(private readonly categoriaRepository: ICategoriaRepository) {}

  async execute(input: {
    userId: string;
    esDemo: boolean;
    id: string;
    nombre?: string;
    bucket?: string;
  }): Promise<Result<CategoriaConPatrones, ActualizarCategoriaError>> {
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

    const patch: { nombre?: string; bucket?: string } = {};

    if (input.nombre !== undefined) {
      const nombre = input.nombre.trim();
      if (nombre.length < NOMBRE_MIN || nombre.length > NOMBRE_MAX) {
        return Result.fail(new NombreCategoriaInvalidoError(input.nombre));
      }

      const colisiona = await this.categoriaRepository.existeNombre(
        input.userId,
        nombre,
        input.id,
      );
      if (colisiona) {
        return Result.fail(new NombreCategoriaDuplicadoError(nombre));
      }

      patch.nombre = nombre;
    }

    if (input.bucket !== undefined) {
      if (
        !BUCKETS_ASIGNABLES.includes(
          input.bucket as (typeof BUCKETS_ASIGNABLES)[number],
        )
      ) {
        return Result.fail(new BucketNoAsignableError(input.bucket));
      }

      if (input.bucket !== (actual.bucket as string)) {
        patch.bucket = input.bucket;
      }
    }

    const actualizada = await this.categoriaRepository.actualizar(
      input.userId,
      input.id,
      patch,
    );
    return Result.ok(actualizada);
  }
}
