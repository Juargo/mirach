import type { ObtenerDetalleBucketMesResult } from '../../../application/use-cases/obtener-detalle-bucket-mes.use-case';

/**
 * DetalleBucketMesDto — forma HTTP de `GET /api/buckets/:bucket/detalle`
 * (US-051, design D-06).
 *
 * Sigue la disciplina BigInt-safe de `ResumenMesDto`/`SemaforoDetalleDto`:
 * - dinero (`total`, `subtotal`, `monto`) como strings decimales (CA-05) —
 *   el typechecker no puede redondear un string;
 * - `porcentajeBp`/`metaBp` como JS numbers (bp ≤ 10000 ≪ 2^53), `null`
 *   para SinCategoria (D-05);
 * - `fecha` ISO-8601 UTC completo vía `toISOString()` (convención bloqueada);
 * - SIN PII de CUENTA (MBD-08): `tipoCuenta`/`numeroCuenta` no existen ni
 *   siquiera en el TIPO — fueron recortados en el borde de aplicación (gate
 *   PR1), este DTO solo serializa la proyección. `origen` (nombre de banco
 *   verbatim, o `'Manual'`) SÍ viaja — es la señal `esManual` que
 *   WEB-DEL-01 necesita, mirror de `IngresosMesDto` (D-02,
 *   correccion-movimientos-manuales).
 */
export interface DetalleBucketMesDto {
  readonly periodo: string;
  readonly bucket: string;
  readonly total: string;
  readonly totalTransacciones: number;
  readonly totalCategorias: number;
  readonly porcentajeBp: number | null;
  readonly metaBp: number | null;
  readonly grupos: ReadonlyArray<{
    readonly categoriaId: string | null;
    readonly nombre: string;
    readonly subtotal: string;
    readonly conteo: number;
    readonly transacciones: ReadonlyArray<{
      readonly id: string;
      readonly fecha: string;
      readonly descripcion: string;
      readonly origen: string;
      readonly monto: string;
    }>;
  }>;
}

/**
 * aDetalleBucketMesDto — mapper del resultado del use case al contrato HTTP.
 * Nunca una fuente de verdad: cada valor viaja verbatim desde application,
 * solo serializado (BigInt→string, bp→number). Infraestructura conoce la
 * forma exacta del JSON; application no sabe nada de HTTP (ADR-005).
 */
export function aDetalleBucketMesDto(
  data: ObtenerDetalleBucketMesResult,
): DetalleBucketMesDto {
  return {
    periodo: data.periodo,
    bucket: data.bucket,
    total: String(data.total),
    totalTransacciones: data.totalTransacciones,
    totalCategorias: data.totalCategorias,
    porcentajeBp: data.porcentajeBp === null ? null : Number(data.porcentajeBp),
    metaBp: data.metaBp === null ? null : Number(data.metaBp),
    grupos: data.grupos.map((grupo) => ({
      categoriaId: grupo.categoriaId,
      nombre: grupo.nombre,
      subtotal: String(grupo.subtotal),
      conteo: grupo.conteo,
      transacciones: grupo.transacciones.map((tx) => ({
        id: tx.id,
        fecha: tx.fecha.toISOString(),
        descripcion: tx.descripcion,
        origen: tx.origen,
        monto: String(tx.monto),
      })),
    })),
  };
}
