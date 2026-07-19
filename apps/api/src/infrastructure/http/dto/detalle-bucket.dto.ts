import { ObtenerDetalleBucketResult } from '../../../application/use-cases/obtener-detalle-bucket.use-case';

/**
 * DetalleBucketTransaccionDto — forma HTTP de una transacción en el detalle
 * de un bucket (US-017).
 *
 * cargo/abono son STRING (String(bigint)) — nunca number, evita pérdida de
 * precisión para valores > Number.MAX_SAFE_INTEGER. fecha como ISO-8601 UTC
 * completo via toISOString() — convención bloqueada (ver movimiento-mes.dto.ts).
 *
 * `categoria` (US-013 CATAPI-05) es `{ id, nombre } | null` ya foldeado —
 * `null` para filas Ingreso/SinCategoria. Campo aditivo, no rompe contrato
 * existente.
 */
export interface DetalleBucketTransaccionDto {
  readonly id: string;
  readonly fecha: string;
  readonly descripcion: string;
  readonly cargo: string;
  readonly abono: string;
  readonly banco: string;
  readonly tipoCuenta: string;
  readonly numeroCuenta: string;
  readonly categoria: { readonly id: string; readonly nombre: string } | null;
}

/**
 * DetalleBucketDto — contrato HTTP de GET /api/buckets/:bucket en caso de éxito.
 *
 * bucket: refleja el valor validado (echo, no el raw input).
 * transacciones: lista plana (MVP) — sin agrupación por comercio.
 */
export interface DetalleBucketDto {
  readonly periodo: string;
  readonly bucket: string;
  readonly transacciones: ReadonlyArray<DetalleBucketTransaccionDto>;
}

/**
 * Mapea el resultado del use case al contrato HTTP.
 * Vive en infrastructure/http porque conoce la forma exacta del JSON de respuesta.
 * Application no sabe nada de HTTP ni de DTOs.
 */
export function aDetalleBucketDto(data: ObtenerDetalleBucketResult): DetalleBucketDto {
  return {
    periodo: data.periodo,
    bucket: data.bucket,
    transacciones: data.transacciones.map((tx) => ({
      id: tx.id,
      fecha: tx.fecha.toISOString(),
      descripcion: tx.descripcion,
      cargo: String(tx.cargo),
      abono: String(tx.abono),
      banco: tx.banco,
      tipoCuenta: tx.tipoCuenta,
      numeroCuenta: tx.numeroCuenta,
      categoria: tx.categoria,
    })),
  };
}
