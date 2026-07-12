import { ResumenMes } from '../../../domain/value-objects/resumen-mes';
import { TARGETS_503020 } from '../../../domain/value-objects/resumen-mes';
import { Bucket } from '../../../domain/value-objects/bucket';
import { EstadoSemaforo } from '../../../domain/value-objects/estado-semaforo';

/**
 * BucketResumenDto — HTTP shape for a single spend bucket in the resumen.
 *
 * total: BigInt serialized as decimal string — no precision loss (SC-06).
 * porcentajeBp: JS number|null (basis-point integer, e.g. 5000 = 50.00%).
 *   - Safe as number: bp values ≤ 10000, far below 2^53.
 *   - null when sinIngreso=true (no income → no percentage makes sense).
 *   - USER-LOCKED DECISION: integer number, NOT a string.
 * estadoSemaforo: lowercase wire representation of EstadoSemaforo (US-016).
 *   - 'verde' | 'amarillo' | 'rojo' | null
 *   - null for SinCategoria or sinIngreso path.
 */
export interface BucketResumenDto {
  readonly bucket: string;
  readonly total: string;
  readonly porcentajeBp: number | null;
  readonly estadoSemaforo: string | null;
}

/**
 * ResumenMesDto — HTTP contract for GET /api/resumen on success.
 *
 * totalIngreso: BigInt as decimal string (SC-06 BigInt-safe).
 * sinIngreso: true when totalIngreso === "0" (HTTP 200, not an error — SC-04).
 * buckets: always 4 entries (Necesidades, Deseos, Ahorro, SinCategoria).
 * targets: hardcoded 50/30/20 reference for US-016/UI.
 * estadoGlobal: worst traffic-light state across measured buckets (US-016).
 *   - lowercase: 'verde' | 'amarillo' | 'rojo' | null
 *   - null when sinIngreso=true.
 */
export interface ResumenMesDto {
  readonly periodo: string;
  readonly totalIngreso: string;
  readonly sinIngreso: boolean;
  readonly buckets: ReadonlyArray<BucketResumenDto>;
  readonly targets: {
    readonly Necesidades: number;
    readonly Deseos: number;
    readonly Ahorro: number;
  };
  readonly estadoGlobal: string | null;
}

/**
 * ESTADO_WIRE — frozen enum-to-lowercase-wire map (US-016).
 * Using an explicit record rather than .toLowerCase() decouples the JSON
 * contract from the internal enum name and fails loudly if a new variant is added.
 */
const ESTADO_WIRE = Object.freeze({
  [EstadoSemaforo.Verde]: 'verde',
  [EstadoSemaforo.Amarillo]: 'amarillo',
  [EstadoSemaforo.Rojo]: 'rojo',
} as const satisfies Record<EstadoSemaforo, string>);

/** Convert EstadoSemaforo enum → lowercase wire string, or null → null. */
function aWire(estado: EstadoSemaforo | null): string | null {
  return estado === null ? null : ESTADO_WIRE[estado];
}

/**
 * aResumenMesDto — mapper from domain VO to HTTP DTO.
 *
 * BigInt-safe serialization:
 *   - String(bigint) for monetary amounts — explicit toString, never JSON.stringify(BigInt).
 *   - Number(bigint) for porcentajeBp — safe because bp ≤ 10000 < 2^53.
 *   - No float, no Math.*, no parseFloat at any step.
 * US-016: estadoSemaforo per bucket + estadoGlobal at top level via aWire().
 */
export function aResumenMesDto(periodo: string, resumen: ResumenMes): ResumenMesDto {
  return {
    periodo,
    totalIngreso: String(resumen.totalIngreso),
    sinIngreso: resumen.sinIngreso,
    buckets: resumen.buckets.map((slice) => ({
      bucket: slice.bucket,
      total: String(slice.total),
      porcentajeBp:
        slice.porcentajeBp === null ? null : Number(slice.porcentajeBp),
      estadoSemaforo: aWire(slice.estadoSemaforo),
    })),
    targets: {
      [Bucket.Necesidades]: TARGETS_503020[Bucket.Necesidades]!,
      [Bucket.Deseos]: TARGETS_503020[Bucket.Deseos]!,
      [Bucket.Ahorro]: TARGETS_503020[Bucket.Ahorro]!,
    },
    estadoGlobal: aWire(resumen.estadoGlobal),
  };
}
