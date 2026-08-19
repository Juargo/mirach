import type { ObtenerIngresosMesResult } from '../../../application/use-cases/obtener-ingresos-mes.use-case';

/**
 * IngresosMesDto — forma HTTP de `GET /api/ingresos/mes` (US-052, design D-04).
 *
 * Sigue la disciplina BigInt-safe de `DetalleBucketMesDto`/`ResumenMesDto`:
 * - dinero (`total`, `monto`) como strings decimales (CA-05/MID-05) — exactos
 *   más allá de `Number.MAX_SAFE_INTEGER`, el typechecker jamás los redondea;
 * - `fecha` ISO-8601 UTC completo vía `toISOString()` (convención bloqueada);
 * - `origen` = nombre del banco verbatim (CA-02/MID-02), `"Manual"` como rama
 *   dead-code del use case — passthrough, sin normalización;
 * - EXACTAMENTE `{total, conteo, transacciones}` — sin `meta`/`porcentaje`/
 *   `estado` (MID-03: los ingresos no participan de 50/30/20 como gasto) y sin
 *   echo de `periodo` (MID-01 autoritativo; un echo rompería el schema
 *   `.strict()` del PR2, D-03);
 * - SIN PII de cuenta (MID-06): `tipoCuenta`/`numeroCuenta` no existen ni
 *   siquiera en el TIPO — fueron recortados en el borde de aplicación (gate
 *   PR1, D-02), este DTO solo serializa la proyección.
 */
export interface IngresosMesDto {
  readonly total: string;
  readonly conteo: number;
  readonly transacciones: ReadonlyArray<{
    readonly id: string;
    readonly fecha: string;
    readonly descripcion: string;
    readonly origen: string;
    readonly monto: string;
  }>;
}

/**
 * aIngresosMesDto — mapper del resultado del use case al contrato HTTP.
 * Nunca una fuente de verdad: cada valor viaja verbatim desde application,
 * solo serializado (BigInt→string). Infraestructura conoce la forma exacta
 * del JSON; application no sabe nada de HTTP (ADR-005).
 */
export function aIngresosMesDto(
  data: ObtenerIngresosMesResult,
): IngresosMesDto {
  return {
    total: String(data.total),
    conteo: data.conteo,
    transacciones: data.transacciones.map((tx) => ({
      id: tx.id,
      fecha: tx.fecha.toISOString(),
      descripcion: tx.descripcion,
      origen: tx.origen,
      monto: String(tx.monto),
    })),
  };
}
