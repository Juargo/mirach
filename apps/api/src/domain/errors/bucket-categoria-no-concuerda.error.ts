import { Bucket } from '../value-objects/bucket';

/**
 * BucketCategoriaNoConcuerdaError — error de dominio (US-058, D-03).
 *
 * Se produce cuando un movimiento Gasto referencia una `categoriaId` que
 * pertenece al catálogo del usuario, pero está asignada a un bucket distinto
 * al que indica el campo `bucket` de la request.
 *
 * La validación sigue la cascada: primero se confirma que la categoría existe
 * en el catálogo (CategoriaFueraDeCatalogoError); si existe, se verifica que
 * el bucket coincida (este error).
 *
 * El `message` es una CONSTANTE de compilación: NO interpola el `categoriaId`
 * ni el `bucket` (ADR-013, misma doctrina que CategoriaFueraDeCatalogoError).
 * Ambas propiedades se conservan para logging/diagnóstico pero nunca alcanzan
 * el mensaje que termina en respuestas HTTP 400.
 */
export class BucketCategoriaNoConcuerdaError extends Error {
  constructor(
    public readonly categoriaId: string,
    public readonly bucket: Bucket,
  ) {
    super(
      'la categoría indicada no pertenece al bucket solicitado; ' +
        'verifique que el bucket corresponda al de la categoría propia',
    );
    this.name = 'BucketCategoriaNoConcuerdaError';
  }
}
