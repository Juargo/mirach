import { ObtenerMovimientosMesResult } from '../../../application/use-cases/obtener-movimientos-mes.use-case';

/**
 * MovimientoMesItemDto — forma HTTP de un movimiento en la lista mensual.
 *
 * cargo/abono son STRING (String(bigint)) — nunca number. La serialización
 * aquí evita la pérdida de precisión para valores > Number.MAX_SAFE_INTEGER
 * (REQ-07 / AC-08). fecha como ISO 8601 UTC string.
 *
 * `bucket` es el valor del Bucket de dominio ya foldeado (ej: `'Necesidades'`,
 * `'SinCategoria'`) — NUNCA el bucketId físico crudo (MOV-01). El fold ocurre
 * en el repositorio; este mapper es un pass-through.
 */
export interface MovimientoMesItemDto {
  id: string;
  fecha: string;
  descripcion: string;
  cargo: string;
  abono: string;
  banco: string;
  tipoCuenta: string;
  numeroCuenta: string;
  bucket: string;
}

/**
 * MovimientosMesDto — contrato HTTP de GET /api/movimientos en caso de éxito.
 *
 * Envelope con periodo normalizado, total de transacciones y la lista plana.
 * Diseñado para dejar espacio a ?page= sin cambio de contrato (REQ-10).
 */
export interface MovimientosMesDto {
  periodo: string;
  totalTransacciones: number;
  transacciones: ReadonlyArray<MovimientoMesItemDto>;
}

/**
 * Mapea el resultado del use case al contrato HTTP.
 * Vive en infrastructure/http porque conoce la forma exacta del JSON de respuesta.
 * Application no sabe nada de HTTP ni de DTOs.
 */
export function aMovimientosMesDto(data: ObtenerMovimientosMesResult): MovimientosMesDto {
  return {
    periodo: data.periodo,
    totalTransacciones: data.transacciones.length,
    transacciones: data.transacciones.map((tx) => ({
      id: tx.id,
      fecha: tx.fecha.toISOString(),
      descripcion: tx.descripcion,
      cargo: String(tx.cargo),
      abono: String(tx.abono),
      banco: tx.banco,
      tipoCuenta: tx.tipoCuenta,
      numeroCuenta: tx.numeroCuenta,
      bucket: tx.bucket,
    })),
  };
}
