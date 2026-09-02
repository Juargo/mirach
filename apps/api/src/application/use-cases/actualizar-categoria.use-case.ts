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
 * `PATCH /api/categorias/:id` (US-038, CAT038-03; ADR-042, design.md D-03).
 *
 * Body PARCIAL (Q4): `nombre` y `bucket` son ambos opcionales, al menos uno
 * presente — la regla de "al menos un campo" la exige el schema Zod
 * (transporte), no este use case.
 *
 * Orden de validación, EXACTO por design.md D-03 (REORDENADO por ADR-042 —
 * antes era nombre-forma → nombre-unicidad → bucket-asignabilidad; ahora la
 * unicidad depende del bucket, así que el bucket debe validarse ANTES):
 *   1. demo gate
 *   2. 404 si la fila no es del caller (ANTES de validar cualquier campo)
 *   3. `nombre`? → forma (shape únicamente, todavía no unicidad)
 *   4. `bucket`? → asignabilidad
 *   5. UNA sola verificación de unicidad sobre el PAR EFECTIVO
 *      `(nombreEfectivo, bucketEfectivo)` — el que la fila tendría tras este
 *      patch, sea cual sea la combinación de campos presentes. `excluirId`
 *      excluye siempre la propia fila (un patch no-op nunca produce un falso
 *      409). Consecuencia observable: un patch con un `nombre` colisionante
 *      Y un `bucket` inválido devuelve `400 BUCKET_NO_ASIGNABLE`, no `409`
 *      (no se puede preguntar "¿el par está tomado?" contra un bucket que
 *      todavía no se validó).
 *   6. arma el patch — `bucket` se incluye SOLO si el bucket cambió (D-07,
 *      el mecanismo que dispara el re-stamp en infraestructura sin un flag)
 *   7. delega en el repositorio
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

    let nombreValidado: string | undefined;
    if (input.nombre !== undefined) {
      const nombre = input.nombre.trim();
      if (nombre.length < NOMBRE_MIN || nombre.length > NOMBRE_MAX) {
        return Result.fail(new NombreCategoriaInvalidoError(input.nombre));
      }
      nombreValidado = nombre;
    }

    let bucketValidado: string | undefined;
    if (input.bucket !== undefined) {
      if (
        !BUCKETS_ASIGNABLES.includes(
          input.bucket as (typeof BUCKETS_ASIGNABLES)[number],
        )
      ) {
        return Result.fail(new BucketNoAsignableError(input.bucket));
      }
      bucketValidado = input.bucket;
    }

    // El par que la fila TENDRÍA tras este patch — lo único que vale la pena
    // preguntar (design.md D-03).
    const nombreEfectivo = nombreValidado ?? actual.nombre;
    const bucketEfectivo = bucketValidado ?? actual.bucket;

    const colisiona = await this.categoriaRepository.existeNombre({
      userId: input.userId,
      nombre: nombreEfectivo,
      bucket: bucketEfectivo,
      excluirId: input.id, // la fila nunca colisiona consigo misma
    });
    if (colisiona) {
      return Result.fail(new NombreCategoriaDuplicadoError(nombreEfectivo));
    }

    const patch: { nombre?: string; bucket?: string } = {};
    if (nombreValidado !== undefined) {
      patch.nombre = nombreValidado;
    }
    // bucket ONLY si efectivamente cambió (D-07, dispara el re-stamp).
    if (
      bucketValidado !== undefined &&
      bucketValidado !== (actual.bucket as string)
    ) {
      patch.bucket = bucketValidado;
    }

    const actualizada = await this.categoriaRepository.actualizar(
      input.userId,
      input.id,
      patch,
    );
    return Result.ok(actualizada);
  }
}
