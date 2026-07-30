import { IngestaResumen } from '../../../application/ports/listar-ingestas.port';

/**
 * IngestaListItemDto — contrato HTTP de un item de `GET /api/ingestas`
 * (US-018, ING-03, design.md §6.2).
 *
 * `totalTransacciones` es un CONTEO de filas, no dinero — `number` plano,
 * sin tratamiento BigInt/`String()` (contraste con los DTOs de cargo/abono).
 */
export interface IngestaListItemDto {
  readonly id: string;
  readonly banco: string;
  readonly fecha: string; // ISO-8601
  readonly totalTransacciones: number;
}

/**
 * Mapea el read model de application al contrato HTTP. Vive en
 * infrastructure/http porque conoce la forma exacta del JSON de respuesta
 * (serialización de `Date` a ISO string) — application no sabe nada de HTTP.
 */
export function aIngestaListItemDto(r: IngestaResumen): IngestaListItemDto {
  return {
    id: r.id,
    banco: r.banco,
    fecha: r.fecha.toISOString(),
    totalTransacciones: r.totalTransacciones,
  };
}
