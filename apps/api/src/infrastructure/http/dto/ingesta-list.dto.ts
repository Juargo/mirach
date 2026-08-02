import {
  EstadoIngestaResumen,
  IngestaResumen,
} from '../../../application/ports/listar-ingestas.port';

/**
 * IngestaListItemDto — contrato HTTP de un item de `GET /api/ingestas`
 * (US-018 base; US-004 lo amplía a historial completo con nombre de archivo,
 * estado y motivo de fallo).
 *
 * `totalTransacciones` es un CONTEO de filas, no dinero — `number` plano,
 * sin tratamiento BigInt/`String()` (contraste con los DTOs de cargo/abono);
 * es 0 en ingestas no exitosas (CA-03). `estado` viene ya traducido a
 * lenguaje de UI ('exitoso' | 'fallido' | 'pendiente', CA-02) desde el reader.
 * `motivoFallo` solo está poblado en las fallidas (CA-04).
 */
export interface IngestaListItemDto {
  readonly id: string;
  readonly banco: string;
  readonly nombreArchivo: string;
  readonly fecha: string; // ISO-8601
  readonly estado: EstadoIngestaResumen;
  readonly totalTransacciones: number;
  readonly motivoFallo: string | null;
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
    nombreArchivo: r.nombreArchivo,
    fecha: r.fecha.toISOString(),
    estado: r.estado,
    totalTransacciones: r.totalTransacciones,
    motivoFallo: r.motivoFallo,
  };
}
