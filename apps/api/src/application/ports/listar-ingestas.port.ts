/**
 * IngestaEstado — local string-literal union (US-004, design.md §4.2). NO es
 * el enum `EstadoIngesta` importado de `@prisma/client` — ADR-005 prohíbe que
 * application importe un tipo de infraestructura/persistencia. Solo dos
 * estados TERMINALES aparecen en el historial (PENDIENTE queda fuera, ver
 * §4.1/D7): una ingesta exitosa o una fallida.
 */
export type IngestaEstado = 'PROCESADA' | 'FALLIDA';

/**
 * IngestaResumen — read model de application para el listado de ingestas
 * del usuario autenticado (US-004/US-018, ING-03). Colocado en el port file
 * (misma convención que ReclasificarCategoriaResult).
 *
 * US-004 widen: `banco` ahora `string | null` (una FALLIDA temprana no tiene
 * banco resuelto); `nombreArchivo`/`estado`/`motivoFallo` son nuevos.
 * `fecha` es un `Date` (Ingesta.creadoEn) — el DTO HTTP lo serializa a ISO
 * string en el boundary. `totalTransacciones` viene del valor YA persistido
 * (nunca un `COUNT(*)`); para FALLIDA es 0 (coalescido en el reader — nunca
 * se muestra al usuario, que ve `motivoFallo` en su lugar).
 */
export interface IngestaResumen {
  readonly id: string;
  readonly banco: string | null;
  readonly nombreArchivo: string;
  readonly estado: IngestaEstado;
  readonly motivoFallo: string | null;
  readonly fecha: Date;
  readonly totalTransacciones: number;
}

/**
 * IListarIngestasReader — port de lectura para el listado de ingestas
 * (US-004/US-018, ING-03). Narrow port (SOLID ISP), mirrors el resto de los
 * readers de lectura (movimientos-mes, resumen-mes, detalle-bucket).
 *
 * Contrato: `listarPorUsuario` DEBE aplicar aislamiento estructural por
 * `userId` (RNF-SEC-006) en la cláusula WHERE — el ÚNICO mecanismo capaz de
 * aislar una fila FALLIDA sin `accountId` (US-004, design.md §4.1/D4).
 */
export interface IListarIngestasReader {
  listarPorUsuario(userId: string): Promise<IngestaResumen[]>;
}

/** Token de inyección — las interfaces se borran en runtime. */
export const LISTAR_INGESTAS_READER = 'IListarIngestasReader';
