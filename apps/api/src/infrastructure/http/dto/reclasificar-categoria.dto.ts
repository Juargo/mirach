import { ReclasificarCategoriaResult } from '../../../application/ports/reclasificar-categoria.port';

/**
 * ReclasificarCategoriaBodyDto — forma cruda del body de
 * PATCH /api/transacciones/:id/categoria (US-013 S4).
 *
 * `categoria` viaja como el `nombre` del dominio (no el id físico) — mirrors
 * exactamente cómo DetalleBucketController valida `:bucket` contra el enum
 * Bucket, y mantiene los ids físicos (CATEGORIA_IDS) dentro de
 * infraestructura (design.md §4.1, MOV-01 convention).
 */
export interface ReclasificarCategoriaBodyDto {
  readonly categoria?: unknown;
}

/**
 * ReclasificarCategoriaResponseDto — contrato HTTP de éxito (200).
 *
 * `categoria` expone `{id, nombre}` (a diferencia de `bucket`, que se
 * expone plano) porque es el WRITE TARGET del control de reclasificación en
 * la web — necesita una clave estable además del label (design.md §5).
 */
export interface ReclasificarCategoriaResponseDto {
  readonly id: string;
  readonly categoria: { readonly id: string; readonly nombre: string };
  readonly bucket: string;
}

/**
 * Mapea el resultado del use case al contrato HTTP. Vive en
 * infrastructure/http porque conoce la forma exacta del JSON de respuesta.
 * El id físico de la categoría (`data.categoriaId`) YA VIENE resuelto por el
 * writer contra el catálogo REAL del usuario (US-037) — este mapper nunca
 * resuelve ids por su cuenta, solo copia el que recibió.
 */
export function aReclasificarCategoriaDto(
  data: ReclasificarCategoriaResult,
): ReclasificarCategoriaResponseDto {
  return {
    id: data.id,
    categoria: { id: data.categoriaId, nombre: data.categoria },
    bucket: data.bucket,
  };
}
