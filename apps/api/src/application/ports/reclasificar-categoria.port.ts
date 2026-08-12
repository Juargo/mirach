import { Result } from '../../shared/result';
import { Bucket } from '../../domain/value-objects/bucket';
import { TransaccionNoEncontradaError } from '../../domain/errors/transaccion-no-encontrada.error';
import { CategoriaDesconocidaError } from '../../domain/errors/categoria-desconocida.error';

/**
 * Resultado de una reasignación exitosa.
 *
 * `categoriaId` (US-037) es el id REAL, per-user, de la fila `Categoria` que
 * quedó persistida en `Transaccion.categoriaId` — ya no se resuelve vía el
 * mapa global `CATEGORIA_IDS` (design.md §4.3). `categoria` (ADR-037/Q5) es
 * el `nombre` de esa misma fila — ya no un miembro del enum retirado.
 * `bucket` viene resuelto por el writer, junto con `categoriaId`.
 */
export interface ReclasificarCategoriaResult {
  readonly id: string;
  readonly categoriaId: string;
  readonly categoria: string;
  readonly bucket: Bucket;
}

/**
 * IReclasificarCategoriaWriter — port de escritura para la reclasificación
 * manual de una transacción (US-013, CATAPI-01/03/04; CAT037-04, ADR-037/Q5).
 *
 * Narrow port (SOLID ISP): solo expone la operación que necesita
 * ReclasificarTransaccionUseCase. El writer resuelve `nombre` contra el
 * catálogo REAL del usuario (`(userId, nombre)`) y devuelve tanto el
 * `categoriaId` como el `bucket` ya derivados — el use case deja de validar
 * ni derivar nada, solo delega.
 *
 * Contrato: `reasignar` DEBE aplicar aislamiento estructural por `userId`
 * (RNF-SEC-006) en la cláusula WHERE — nunca en app-layer. Un `count === 0`
 * (no existe O no es del usuario) se traduce a
 * `Result.fail(TransaccionNoEncontradaError)` — los dos casos son
 * indistinguibles (anti-enumeration). Un `nombre` que no resuelve a ninguna
 * fila del catálogo del usuario se traduce a
 * `Result.fail(CategoriaDesconocidaError)` — nunca enumera el catálogo.
 */
export interface IReclasificarCategoriaWriter {
  reasignar(
    userId: string,
    transaccionId: string,
    nombre: string,
  ): Promise<
    Result<
      ReclasificarCategoriaResult,
      TransaccionNoEncontradaError | CategoriaDesconocidaError
    >
  >;
}

/** Token de inyección — las interfaces se borran en runtime. */
export const RECLASIFICAR_CATEGORIA_WRITER = 'IReclasificarCategoriaWriter';
