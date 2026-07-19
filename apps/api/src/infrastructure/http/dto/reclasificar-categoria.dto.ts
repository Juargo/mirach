import { ReclasificarCategoriaResult } from '../../../application/ports/reclasificar-categoria.port';
import { CATEGORIA_IDS } from '../../persistence/categoria-ids';

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
 * infrastructure/http porque conoce la forma exacta del JSON de respuesta y
 * el id físico de la categoría (CATEGORIA_IDS) — application no sabe nada de
 * HTTP ni de ids físicos.
 */
export function aReclasificarCategoriaDto(
  data: ReclasificarCategoriaResult,
): ReclasificarCategoriaResponseDto {
  return {
    id: data.id,
    categoria: { id: CATEGORIA_IDS[data.categoria], nombre: data.categoria },
    bucket: data.bucket,
  };
}
