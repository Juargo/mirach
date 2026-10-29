import { ResumenMes } from '../../../domain/value-objects/resumen-mes';
import { TARGETS_503020 } from '../../../domain/value-objects/resumen-mes';
import { Bucket } from '../../../domain/value-objects/bucket';
import { EstadoSemaforo } from '../../../domain/value-objects/estado-semaforo';
import { EstadoBloque } from '../../../domain/value-objects/estado-bloque';

/**
 * BucketResumenDto — HTTP shape for a single spend bucket in the resumen.
 *
 * total: BigInt serialized as decimal string — no precision loss (SC-06).
 * porcentajeBp: JS number|null (basis-point integer, e.g. 5000 = 50.00%).
 *   - Safe as number: bp values ≤ 10000, far below 2^53.
 *   - null when sinIngreso=true (no income → no percentage makes sense).
 *   - USER-LOCKED DECISION: integer number, NOT a string.
 * participacionGastoBp: share of the month's total spend in basis points
 *   (sums to 10000 across buckets; null when there is no spend).
 * estadoSemaforo: lowercase wire representation of EstadoSemaforo (US-016).
 *   - 'verde' | 'amarillo' | 'rojo' | null
 *   - null for the sinIngreso path.
 * estado: rule 9 state (issue #113), 'bien' | 'cerca' | 'sobre' | null.
 *   - null for the sinIngreso path.
 */
export interface BucketResumenDto {
  readonly bucket: string;
  readonly total: string;
  readonly porcentajeBp: number | null;
  readonly participacionGastoBp: number | null;
  readonly estadoSemaforo: string | null;
  readonly estado: string | null;
}

/**
 * ResumenMesDto — HTTP contract for GET /api/resumen on success.
 *
 * totalIngreso: BigInt as decimal string (SC-06 BigInt-safe).
 * sinIngreso: true when totalIngreso === "0" (HTTP 200, not an error — SC-04).
 * buckets: always 3 entries (Necesidades, Deseos, Ahorro) — issue #778 tramo
 *   5b PR5 removed `Bucket.SinCategoria`/`cantidadSinCategoria` from the
 *   domain AND this wire contract. This is a BREAKING change of the
 *   `/api/resumen` response shape; web/mobile clients tolerate both the old
 *   (4 buckets + cantidadSinCategoria) and new (3 buckets, no
 *   cantidadSinCategoria) shapes during the deploy window (see their
 *   `esResumenMesDto` guards).
 * targets: hardcoded 50/30/20 reference for US-016/UI.
 * estadoGlobal: worst traffic-light state across measured buckets (US-016).
 *   - lowercase: 'verde' | 'amarillo' | 'rojo' | null
 *   - null when sinIngreso=true.
 * estadoMes: worst rule 9 state of the three blocks (issue #113, VIS-11),
 *   'bien' | 'cerca' | 'sobre' | null (null when sinIngreso=true).
 * bloquesEstadoMes: bucket ids tied at that worst state, in `buckets` order,
 *   for the month sentence (VIS-03); [] when the month is 'bien' or null.
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
  readonly estadoMes: string | null;
  readonly bloquesEstadoMes: ReadonlyArray<string>;
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

/** ESTADO_BLOQUE_WIRE — rule 9 states on the wire (issue #113). */
const ESTADO_BLOQUE_WIRE = Object.freeze({
  [EstadoBloque.Bien]: 'bien',
  [EstadoBloque.Cerca]: 'cerca',
  [EstadoBloque.Sobre]: 'sobre',
} as const satisfies Record<EstadoBloque, string>);

/** Convert EstadoBloque enum → lowercase wire string, or null → null. */
function aWireBloque(estado: EstadoBloque | null): string | null {
  return estado === null ? null : ESTADO_BLOQUE_WIRE[estado];
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
export function aResumenMesDto(
  periodo: string,
  resumen: ResumenMes,
): ResumenMesDto {
  return {
    periodo,
    totalIngreso: String(resumen.totalIngreso),
    sinIngreso: resumen.sinIngreso,
    buckets: resumen.buckets.map((slice) => ({
      bucket: slice.bucket,
      total: String(slice.total),
      porcentajeBp:
        slice.porcentajeBp === null ? null : Number(slice.porcentajeBp),
      participacionGastoBp:
        slice.participacionGastoBp === null
          ? null
          : Number(slice.participacionGastoBp),
      estadoSemaforo: aWire(slice.estadoSemaforo),
      estado: aWireBloque(slice.estado),
    })),
    targets: {
      [Bucket.Necesidades]: TARGETS_503020[Bucket.Necesidades]!,
      [Bucket.Deseos]: TARGETS_503020[Bucket.Deseos]!,
      [Bucket.Ahorro]: TARGETS_503020[Bucket.Ahorro]!,
    },
    estadoGlobal: aWire(resumen.estadoGlobal),
    estadoMes: aWireBloque(resumen.estadoMes),
    bloquesEstadoMes: [...resumen.bloquesEstadoMes],
  };
}
