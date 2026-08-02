import { IngestaResumen } from '../../../application/ports/listar-ingestas.port';

/**
 * IngestaListItemDto — contrato HTTP de un item de `GET /api/ingestas`
 * (US-004/US-018, ING-03, design.md §4.3).
 *
 * US-004 widen (additivo): `banco` ahora `string | null` (una FALLIDA
 * temprana no tiene banco resuelto); `nombreArchivo`/`estado`/`motivoFallo`
 * son nuevos. `estado` es una unión string-literal (NO el enum de Prisma) —
 * el contrato HTTP nunca debe filtrar un tipo de persistencia a través del
 * boundary.
 *
 * `totalTransacciones` es un CONTEO de filas, no dinero — `number` plano,
 * sin tratamiento BigInt/`String()` (contraste con los DTOs de cargo/abono).
 */
export interface IngestaListItemDto {
  readonly id: string;
  readonly banco: string | null;
  readonly nombreArchivo: string;
  readonly estado: 'PROCESADA' | 'FALLIDA';
  readonly motivoFallo: string | null;
  readonly fecha: string; // ISO-8601
  readonly totalTransacciones: number;
}

/**
 * Mapea el read model de application al contrato HTTP. Vive en
 * infrastructure/http porque conoce la forma exacta del JSON de respuesta
 * (serialización de `Date` a ISO string) — application no sabe nada de HTTP.
 *
 * Sin `as`: `IngestaResumen.estado` (application) ya es el literal union
 * `IngestaEstado`, estructuralmente idéntico a `'PROCESADA' | 'FALLIDA'`
 * de este DTO — el único narrowing real (Prisma `EstadoIngesta` → el
 * literal union) vive en el reader de infraestructura (§4.1), no acá.
 */
export function aIngestaListItemDto(r: IngestaResumen): IngestaListItemDto {
  return {
    id: r.id,
    banco: r.banco,
    nombreArchivo: r.nombreArchivo,
    estado: r.estado,
    motivoFallo: r.motivoFallo,
    fecha: r.fecha.toISOString(),
    totalTransacciones: r.totalTransacciones,
  };
}
