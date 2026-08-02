/**
 * EstadoIngestaResumen — estado de una ingesta en lenguaje de dominio/UI
 * (US-004, CA-02). Deliberadamente NO es el enum `EstadoIngesta` de Prisma:
 * application no depende de `@prisma/client` (ADR-024, el backend traduce y el
 * cliente solo renderiza). El mapeo enum→unión vive en el reader (infra).
 *
 * `cancelado` queda fuera de alcance en US-004: no existe flujo de cancelación
 * de ingesta, así que no hay dato que respaldarlo (YAGNI). Se sumará cuando el
 * flujo exista.
 */
export type EstadoIngestaResumen = 'exitoso' | 'fallido' | 'pendiente';

/**
 * IngestaResumen — read model de application para el listado (historial) de
 * ingestas del usuario autenticado (US-018 base; US-004 lo amplía a traza de
 * auditoría completa). Colocado en el port file (misma convención que
 * ReclasificarCategoriaResult).
 *
 * `fecha` es un `Date` (Ingesta.creadoEn) — el DTO HTTP lo serializa a ISO
 * string en el boundary. `totalTransacciones` viene del valor YA persistido
 * en `commit()` (design.md §5.2) — nunca un `COUNT(*)`; es 0 para ingestas no
 * exitosas (CA-03: el conteo solo tiene sentido en las exitosas).
 * `motivoFallo` está poblado solo en las fallidas (CA-04) — ya viene
 * scrubbeado de montos crudos en el boundary de persistencia.
 */
export interface IngestaResumen {
  readonly id: string;
  readonly banco: string;
  readonly nombreArchivo: string;
  readonly fecha: Date;
  readonly estado: EstadoIngestaResumen;
  readonly totalTransacciones: number;
  readonly motivoFallo: string | null;
}

/**
 * IListarIngestasReader — port de lectura para el listado de ingestas
 * (US-018, ING-03). Narrow port (SOLID ISP), mirrors el resto de los readers
 * de lectura (movimientos-mes, resumen-mes, detalle-bucket).
 *
 * Contrato: `listarPorUsuario` DEBE aplicar aislamiento estructural por
 * `userId` (RNF-SEC-006) en la cláusula WHERE.
 */
export interface IListarIngestasReader {
  listarPorUsuario(userId: string): Promise<IngestaResumen[]>;
}

/** Token de inyección — las interfaces se borran en runtime. */
export const LISTAR_INGESTAS_READER = 'IListarIngestasReader';
