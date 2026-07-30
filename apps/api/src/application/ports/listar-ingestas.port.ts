/**
 * IngestaResumen — read model de application para el listado de ingestas
 * del usuario autenticado (US-018, ING-03). Colocado en el port file (misma
 * convención que ReclasificarCategoriaResult).
 *
 * `fecha` es un `Date` (Ingesta.creadoEn) — el DTO HTTP lo serializa a ISO
 * string en el boundary. `totalTransacciones` viene del valor YA persistido
 * en `commit()` (design.md §5.2) — nunca un `COUNT(*)`.
 */
export interface IngestaResumen {
  readonly id: string;
  readonly banco: string;
  readonly fecha: Date;
  readonly totalTransacciones: number;
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
