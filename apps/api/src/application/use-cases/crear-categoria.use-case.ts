import { Result } from '../../shared/result';
import {
  CategoriaConPatrones,
  ICategoriaRepository,
} from '../ports/categoria-repository.port';
import { IPatronRepository } from '../ports/patron-repository.port';
import { CatalogoDemoSoloLecturaError } from '../../domain/errors/catalogo-demo-solo-lectura.error';
import { NombreCategoriaInvalidoError } from '../../domain/errors/nombre-categoria-invalido.error';
import { BucketNoAsignableError } from '../../domain/errors/bucket-no-asignable.error';
import { NombreCategoriaDuplicadoError } from '../../domain/errors/nombre-categoria-duplicado.error';
import { PatronDuplicadoError } from '../../domain/errors/patron-duplicado.error';
import { PatronEnLoteInvalidoError } from '../../domain/errors/patron-en-lote-invalido.error';
import { validarPatron } from './validar-patron';

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
  | NombreCategoriaDuplicadoError
  | PatronEnLoteInvalidoError;

/** Un patrón anidado, tal como llega desde el body HTTP — forma cruda, sin
 * validar (CAT038-10/11). `prioridad` NUNCA viaja acá — el server la
 * defaultea a 100 vía `validarPatron` (D-04, "prioridad NOT accepted"). */
export interface PatronAnidadoInput {
  readonly patron: string;
  readonly matchType: string;
}

/**
 * CrearCategoriaUseCase — use case de escritura para `POST /api/categorias`
 * (US-038, CAT038-01; US-062/CAT038-10..12, patrones anidados).
 *
 * Orden de validación (design.md D-02, §5.1/§5.2): demo gate → forma de
 * `nombre` → asignabilidad de `bucket` → unicidad case-insensitive de
 * `nombre` por usuario → ∀patrón (forma → duplicado-contra-catálogo →
 * duplicado-dentro-del-lote) → `crearConPatrones` — el ÚNICO y PRIMER
 * write (atomicidad doblemente garantizada: nada se escribe hasta que
 * TODOS los patrones pasan, y la única escritura es un statement Prisma
 * anidado, CAT038-10). `bucket` viaja como NOMBRE validado; el port lo
 * recibe en el campo `bucket` (mismo nombre, tipo honesto) y es la capa de
 * infraestructura quien lo resuelve vía `BUCKET_IDS[bucket]` — este use
 * case nunca importa esa tabla (application no depende de infrastructure,
 * ADR-005). Nunca lanza.
 */
export class CrearCategoriaUseCase {
  constructor(
    private readonly categoriaRepository: ICategoriaRepository,
    private readonly patronRepository: IPatronRepository,
  ) {}

  async execute(input: {
    userId: string;
    esDemo: boolean;
    nombre: string;
    bucket: string | undefined;
    patrones?: ReadonlyArray<PatronAnidadoInput>;
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

    const yaExiste = await this.categoriaRepository.existeNombre({
      userId: input.userId,
      nombre,
      bucket: input.bucket, // narrowed to BUCKETS_ASIGNABLES three lines above
    });
    if (yaExiste) {
      return Result.fail(new NombreCategoriaDuplicadoError(nombre));
    }

    const patronesValidados: Array<{
      patron: string;
      matchType: string;
      prioridad: number;
    }> = [];
    // Set en memoria, case-insensitive — F-3: no hay constraint DB en
    // (userId, patron), así que N llamadas a existePatron no pueden verse
    // entre sí las filas del MISMO lote todavía no persistidas (D-02).
    const vistos = new Set<string>();

    const patronesInput = input.patrones ?? [];
    for (let indice = 0; indice < patronesInput.length; indice++) {
      const entrada = patronesInput[indice];
      const validado = validarPatron({
        patron: entrada.patron,
        matchType: entrada.matchType,
      });
      if (validado.isFail()) {
        return Result.fail(
          new PatronEnLoteInvalidoError(indice, validado.getError()),
        );
      }
      const { patron, matchType, prioridad } = validado.getValue();

      const existeEnCatalogo = await this.patronRepository.existePatron(
        input.userId,
        patron,
      );
      if (existeEnCatalogo) {
        return Result.fail(
          new PatronEnLoteInvalidoError(
            indice,
            new PatronDuplicadoError(patron),
          ),
        );
      }

      const clave = patron.toLowerCase();
      if (vistos.has(clave)) {
        return Result.fail(
          new PatronEnLoteInvalidoError(
            indice,
            new PatronDuplicadoError(patron),
          ),
        );
      }
      vistos.add(clave);

      patronesValidados.push({ patron, matchType, prioridad });
    }

    const categoria = await this.categoriaRepository.crearConPatrones(
      input.userId,
      {
        nombre,
        bucket: input.bucket,
        patrones: patronesValidados,
      },
    );
    return Result.ok(categoria);
  }
}
