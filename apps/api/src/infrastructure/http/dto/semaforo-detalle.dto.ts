import { EstadoSemaforo } from '../../../domain/value-objects/estado-semaforo';
import type { SemaforoDetalle } from '../../../domain/value-objects/semaforo-detalle';

/**
 * SemaforoDetalleDto — HTTP shape for `GET /api/resumen/semaforo` (US-049,
 * design §1.6). Mirrors `ResumenMesDto`'s BigInt-safety discipline:
 *
 * - Money (`totalIngreso`, `consejo.monto`, `sinCategoria.total`) travels as
 *   decimal strings — no precision loss (SEM-07).
 * - `porcentajeBp`/`metaBp`/band edges travel as JS numbers (bp ≤ 10000
 *   ≪ 2^53) — same discipline as `porcentajeBp` in `ResumenMesDto`.
 * - `estadoGlobal`/`estadoSemaforo` are the lowercase wire enum (`aWire()`).
 *
 * `buckets` is always exactly 3 entries (Necesidades, Deseos, Ahorro, fixed
 * order) — SinCategoria has no band/estado/target, so its count+total travel
 * in the separate `sinCategoria` object instead (D-03).
 */
export interface SemaforoDetalleDto {
  readonly periodo: string;
  readonly totalIngreso: string;
  readonly sinIngreso: boolean;
  readonly estadoGlobal: string | null;
  readonly diagnostico: string;
  readonly bucketsCriticos: ReadonlyArray<string>;
  readonly buckets: ReadonlyArray<{
    readonly bucket: string;
    readonly total: string;
    readonly porcentajeBp: number | null;
    readonly estadoSemaforo: string | null;
    readonly metaBp: number;
    readonly bandas: {
      readonly verdeMin: number | null;
      readonly verdeMax: number;
      readonly amarilloMin: number | null;
      readonly amarilloMax: number;
    };
    readonly consejo: {
      readonly direccion: 'reducir' | 'aumentar';
      readonly monto: string;
      readonly mensaje: string;
    } | null;
  }>;
  readonly sinCategoria: { readonly cantidad: number; readonly total: string };
}

/**
 * `aWire()` is duplicated here rather than exported from `resumen-mes.dto.ts`
 * — 3 lines, same frozen map, and the two DTOs are independent wire
 * contracts (kiss.md's "tolerar duplicación pequeña", design §1.6). If a
 * third DTO needs it, extract then.
 */
const ESTADO_WIRE = Object.freeze({
  [EstadoSemaforo.Verde]: 'verde',
  [EstadoSemaforo.Amarillo]: 'amarillo',
  [EstadoSemaforo.Rojo]: 'rojo',
} as const satisfies Record<EstadoSemaforo, string>);

function aWire(estado: EstadoSemaforo | null): string | null {
  return estado === null ? null : ESTADO_WIRE[estado];
}

/**
 * aSemaforoDetalleDto — mapper from the domain `SemaforoDetalle` VO to the
 * HTTP DTO. Never a source of truth: every value is carried verbatim from
 * the domain, only serialized (BigInt→string, EstadoSemaforo→wire).
 */
export function aSemaforoDetalleDto(
  periodo: string,
  detalle: SemaforoDetalle,
): SemaforoDetalleDto {
  return {
    periodo,
    totalIngreso: String(detalle.totalIngreso),
    sinIngreso: detalle.sinIngreso,
    estadoGlobal: aWire(detalle.estadoGlobal),
    diagnostico: detalle.diagnostico,
    bucketsCriticos: detalle.bucketsCriticos,
    buckets: detalle.buckets.map((slice) => ({
      bucket: slice.bucket,
      total: String(slice.total),
      porcentajeBp:
        slice.porcentajeBp === null ? null : Number(slice.porcentajeBp),
      estadoSemaforo: aWire(slice.estadoSemaforo),
      metaBp: Number(slice.bandas.metaBp),
      bandas: {
        verdeMin:
          slice.bandas.verdeMin === null ? null : Number(slice.bandas.verdeMin),
        verdeMax: Number(slice.bandas.verdeMax),
        amarilloMin:
          slice.bandas.amarilloMin === null
            ? null
            : Number(slice.bandas.amarilloMin),
        amarilloMax: Number(slice.bandas.amarilloMax),
      },
      consejo:
        slice.consejo === null
          ? null
          : {
              direccion: slice.consejo.direccion,
              monto: String(slice.consejo.monto),
              mensaje: slice.consejo.mensaje,
            },
    })),
    sinCategoria: {
      cantidad: detalle.sinCategoria.cantidad,
      total: String(detalle.sinCategoria.total),
    },
  };
}
