import { CatalogoDemoSoloLecturaError } from '../../../domain/errors/catalogo-demo-solo-lectura.error';
import { NombreCategoriaInvalidoError } from '../../../domain/errors/nombre-categoria-invalido.error';
import { BucketNoAsignableError } from '../../../domain/errors/bucket-no-asignable.error';
import { NombreCategoriaDuplicadoError } from '../../../domain/errors/nombre-categoria-duplicado.error';
import { CategoriaNoEncontradaError } from '../../../domain/errors/categoria-no-encontrada.error';
import { PatronInvalidoError } from '../../../domain/errors/patron-invalido.error';
import { MatchTypeInvalidoError } from '../../../domain/errors/match-type-invalido.error';
import { RegexInvalidaError } from '../../../domain/errors/regex-invalida.error';
import { PrioridadInvalidaError } from '../../../domain/errors/prioridad-invalida.error';
import { PatronDuplicadoError } from '../../../domain/errors/patron-duplicado.error';
import { PatronNoEncontradoError } from '../../../domain/errors/patron-no-encontrado.error';
import { PatronEnLoteInvalidoError } from '../../../domain/errors/patron-en-lote-invalido.error';
import { CrearCategoriaError } from '../../../application/use-cases/crear-categoria.use-case';
import { ActualizarCategoriaError } from '../../../application/use-cases/actualizar-categoria.use-case';
import { EliminarCategoriaError } from '../../../application/use-cases/eliminar-categoria.use-case';
import { CrearPatronError } from '../../../application/use-cases/crear-patron.use-case';
import { ActualizarPatronError } from '../../../application/use-cases/actualizar-patron.use-case';
import { EliminarPatronError } from '../../../application/use-cases/eliminar-patron.use-case';

export type CatalogoError =
  | CrearCategoriaError
  | ActualizarCategoriaError
  | EliminarCategoriaError
  | CrearPatronError
  | ActualizarPatronError
  | EliminarPatronError;

/**
 * aCatalogoHttpError — ÚNICO traductor de errores para `registrarCategorias`
 * y `registrarPatrones` (US-038, design.md §5.3/§7.4). Un class ⇒
 * exactamente un status ⇒ exactamente un `code` (Q2/Q3) — cubre las 11
 * clases alcanzables desde los 6 use cases de mutación del catálogo (no
 * incluye `CategoriaDesconocidaError`, que solo vive en
 * `PATCH /api/transacciones/:id/categoria`, mapeada por su propio switch
 * inline de 2 variantes — mirrors `aHttpError` de `ingesta.routes.ts`).
 * `CategoriaEnUsoError` retirada (US-039, CAT038-04 as modified): el delete
 * ya no rechaza por "en uso", así que ya no hay un `409` que mapear acá.
 *
 * El guard `const _exhaustive: never = error` es el ÚNICO sitio de esta
 * garantía para toda la familia — agregar una variante sin mapearla acá
 * DEJA DE COMPILAR, en vez de caer silenciosamente a un status equivocado.
 */
export function aCatalogoHttpError(error: CatalogoError): {
  status: number;
  code: string;
  message: string;
  indice?: number;
} {
  if (error instanceof PatronEnLoteInvalidoError) {
    // Recurses BY TYPE into `causa` — un `PatronEnLoteInvalidoError` nunca
    // envuelve a otro `PatronEnLoteInvalidoError`, así que esta llamada
    // termina en la traducción de la causa real. Ningún `code`/`status`
    // nuevo — solo se agrega `indice` (CAT038-11, D-03).
    const traduccionCausa = aCatalogoHttpError(error.causa);
    return { ...traduccionCausa, indice: error.indice };
  }
  if (error instanceof NombreCategoriaInvalidoError) {
    return { status: 400, code: 'NOMBRE_INVALIDO', message: error.message };
  }
  if (error instanceof BucketNoAsignableError) {
    return {
      status: 400,
      code: 'BUCKET_NO_ASIGNABLE',
      message: error.message,
    };
  }
  if (error instanceof PatronInvalidoError) {
    return { status: 400, code: 'PATRON_INVALIDO', message: error.message };
  }
  if (error instanceof MatchTypeInvalidoError) {
    return {
      status: 400,
      code: 'MATCH_TYPE_INVALIDO',
      message: error.message,
    };
  }
  if (error instanceof RegexInvalidaError) {
    return { status: 400, code: 'REGEX_INVALIDA', message: error.message };
  }
  if (error instanceof PrioridadInvalidaError) {
    return {
      status: 400,
      code: 'PRIORIDAD_INVALIDA',
      message: error.message,
    };
  }
  if (error instanceof CatalogoDemoSoloLecturaError) {
    return { status: 403, code: 'DEMO_SOLO_LECTURA', message: error.message };
  }
  if (error instanceof CategoriaNoEncontradaError) {
    return {
      status: 404,
      code: 'CATEGORIA_NO_ENCONTRADA',
      message: error.message,
    };
  }
  if (error instanceof PatronNoEncontradoError) {
    return {
      status: 404,
      code: 'PATRON_NO_ENCONTRADO',
      message: error.message,
    };
  }
  if (error instanceof NombreCategoriaDuplicadoError) {
    return { status: 409, code: 'NOMBRE_DUPLICADO', message: error.message };
  }
  if (error instanceof PatronDuplicadoError) {
    return { status: 409, code: 'PATRON_DUPLICADO', message: error.message };
  }
  const _exhaustive: never = error;
  return _exhaustive;
}
