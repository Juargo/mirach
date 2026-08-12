import { Result } from '../../shared/result';
import {
  CategoriaConPatrones,
  ICategoriaRepository,
} from '../ports/categoria-repository.port';
import { CatalogoDemoSoloLecturaError } from '../../domain/errors/catalogo-demo-solo-lectura.error';
import { NombreCategoriaInvalidoError } from '../../domain/errors/nombre-categoria-invalido.error';
import { BucketNoAsignableError } from '../../domain/errors/bucket-no-asignable.error';
import { NombreCategoriaDuplicadoError } from '../../domain/errors/nombre-categoria-duplicado.error';

const NOMBRE_MIN = 1;
const NOMBRE_MAX = 40;

/** Buckets asignables por el usuario — `Ingreso`/`SinCategoria` son estados
 * computados y NUNCA asignables (CAT038-01). `bucket.ts` permanece
 * intocado (design.md §4.1) por eso este set vive aquí, no en el VO. */
const BUCKETS_ASIGNABLES = ['Necesidades', 'Deseos', 'Ahorro'] as const;

export type CrearCategoriaError =
  | CatalogoDemoSoloLecturaError
  | NombreCategoriaInvalidoError
  | BucketNoAsignableError
  | NombreCategoriaDuplicadoError;

/**
 * CrearCategoriaUseCase — use case de escritura para `POST /api/categorias`
 * (US-038, CAT038-01).
 *
 * Orden de validación (design.md §5.1/§5.2): demo gate → forma de `nombre`
 * → asignabilidad de `bucket` → unicidad case-insensitive de `nombre` por
 * usuario → creación. `bucket` viaja como NOMBRE validado; el port lo
 * recibe en el campo `bucket` (mismo nombre, tipo honesto) y es la capa de
 * infraestructura (PR2b) quien lo resuelve vía `BUCKET_IDS[bucket]` (D-02,
 * §5.1) — este use case nunca importa esa tabla (application no depende de
 * infrastructure, ADR-005). Nunca lanza.
 */
export class CrearCategoriaUseCase {
  constructor(private readonly categoriaRepository: ICategoriaRepository) {}

  async execute(input: {
    userId: string;
    esDemo: boolean;
    nombre: string;
    bucket: string | undefined;
  }): Promise<Result<CategoriaConPatrones, CrearCategoriaError>> {
    if (input.esDemo) {
      return Result.fail(new CatalogoDemoSoloLecturaError());
    }

    const nombre = input.nombre.trim();
    if (nombre.length < NOMBRE_MIN || nombre.length > NOMBRE_MAX) {
      return Result.fail(new NombreCategoriaInvalidoError(input.nombre));
    }

    if (
      input.bucket === undefined ||
      !BUCKETS_ASIGNABLES.includes(
        input.bucket as (typeof BUCKETS_ASIGNABLES)[number],
      )
    ) {
      return Result.fail(new BucketNoAsignableError(input.bucket));
    }

    const yaExiste = await this.categoriaRepository.existeNombre(
      input.userId,
      nombre,
    );
    if (yaExiste) {
      return Result.fail(new NombreCategoriaDuplicadoError(nombre));
    }

    const categoria = await this.categoriaRepository.crear(input.userId, {
      nombre,
      bucket: input.bucket,
    });
    return Result.ok(categoria);
  }
}
