import { Bucket } from '../../domain/value-objects/bucket';

/**
 * BUCKET_POR_DEFECTO — bucket destino cuando la ingesta no logra clasificar
 * una transacción (issue #778).
 *
 * Es `Bucket.Deseos` — no `Bucket.Necesidades` — a propósito: el semáforo usa
 * bandas distintas por bucket (ver `estado-semaforo.ts`), y Deseos tiene la
 * banda verde MÁS ANGOSTA (≤30%, contra ≤50% de Necesidades). Un default
 * tiene que FALLAR RUIDOSO: si la plata no clasificada aterrizara en
 * Necesidades, la banda ancha la escondería dentro de "todo normal" durante
 * más tiempo. En Deseos, la misma plata empuja el semáforo a amarillo/rojo
 * antes, así que el usuario la nota y la reclasifica en vez de que quede
 * absuelta en silencio.
 *
 * La UI la muestra como "Gustos" (`ETIQUETA_BUCKET_COPY[Bucket.Deseos]` en
 * `domain/value-objects/semaforo-detalle.ts`, espejado por
 * `ETIQUETA_BUCKET` en `apps/web`) — el dominio siempre la nombra `Deseos`.
 */
export const BUCKET_POR_DEFECTO = Bucket.Deseos;

/**
 * CategoriaPorDefecto — forma mínima que necesita el clasificador para
 * asignar la categoría `Desconocido` del bucket por defecto a una
 * transacción sin coincidencia. Nunca lleva más campos que los que el
 * clasificador realmente usa (YAGNI): ni `patrones`, ni `transaccionesCount`,
 * ni el resto de `CategoriaConPatrones`.
 */
export interface CategoriaPorDefecto {
  readonly id: string;
  readonly nombre: string;
}

/**
 * seleccionarCategoriaInterna — ÚNICA fuente de verdad de "cuál es la
 * `Desconocido` de UN bucket dado" (issue #778, tramo 3). Ningún otro módulo
 * debe filtrar por `esInterna` a mano: la comparación `esInterna === true &&
 * bucket === bucket` vive acá una sola vez (DRY).
 *
 * Pura, sin I/O — el caller es quien resuelve `userId` contra su fuente de
 * datos (repositorio o port) y le pasa la lista ya cargada.
 *
 * Si hubiera más de una fila que calce (no debería, la unicidad de catálogo
 * lo previene), devuelve la primera en el orden de entrada — no lanza ni
 * arma un error, porque decidir eso es un problema de integridad de datos
 * ajeno a esta función pura.
 */
export function seleccionarCategoriaInterna(
  categorias: ReadonlyArray<{
    id: string;
    nombre: string;
    bucket: Bucket;
    esInterna: boolean;
  }>,
  bucket: Bucket,
): CategoriaPorDefecto | null {
  const encontrada = categorias.find(
    (categoria) => categoria.esInterna === true && categoria.bucket === bucket,
  );
  if (!encontrada) return null;
  return { id: encontrada.id, nombre: encontrada.nombre };
}

/**
 * seleccionarCategoriaPorDefecto — destino de la INGESTA cuando una
 * transacción no logra clasificar (issue #778): SIEMPRE la `Desconocido` de
 * `BUCKET_POR_DEFECTO` (Deseos), para fallar ruidoso — ver el docblock de
 * `BUCKET_POR_DEFECTO` más arriba.
 *
 * Distinto propósito de `seleccionarCategoriaInterna`: esta función fija el
 * bucket; el borrado de categoría (tramo 3) necesita la `Desconocido` del
 * MISMO bucket que la fila borrada, no la de Deseos, así que llama al
 * selector genérico con SU PROPIO bucket en vez de usar esta función.
 */
export function seleccionarCategoriaPorDefecto(
  categorias: ReadonlyArray<{
    id: string;
    nombre: string;
    bucket: Bucket;
    esInterna: boolean;
  }>,
): CategoriaPorDefecto | null {
  return seleccionarCategoriaInterna(categorias, BUCKET_POR_DEFECTO);
}
