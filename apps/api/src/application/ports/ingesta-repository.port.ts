import { Result } from '../../shared/result';
import { PersistenciaFallidaError } from '../../domain/errors/persistencia-fallida.error';
import { Transaccion } from '../../domain/value-objects/transaccion';

/**
 * CrearIngestaProcesadaInput — datos completos de una Ingesta EXITOSA
 * (US-004, design.md §6.3). `userId` viaja explícito (threaded desde la
 * sesión, no un lookup extra vía `account`) — RNF-SEC-006 lo exige como
 * columna directa en `Ingesta`, independiente de `accountId`.
 */
export interface CrearIngestaProcesadaInput {
  userId: string;
  accountId: string;
  banco: string;
  nombreArchivo: string;
  transacciones: ReadonlyArray<Transaccion>;
  /** Conteo de duplicados detectados y omitidos ANTES de persistir (US-005). */
  duplicadosOmitidos: number;
}

/**
 * IIngestaRepository — port de aplicación (lado de escritura).
 *
 * US-004 (design.md §3.1/D1): el ciclo de vida COLAPSA a una única escritura
 * atómica — `createPending`/`commit`/`markFailed` desaparecen. La eager
 * PENDIENTE ya no tiene razón de existir (su único propósito era que una
 * FALLIDA posterior sobreviviera; ahora el boundary
 * `IRegistrarIngestaFallidaWriter` posee ese registro). `markFailed` también
 * desaparece: la falla es responsabilidad EXCLUSIVA del boundary
 * (single-writer-per-state).
 *
 * `persistirProcesada` inserta la Ingesta EN ESTADO PROCESADA junto con
 * todas sus transacciones en una única `prisma.$transaction` (a nivel de
 * infraestructura) — un fallo NO debe dejar filas parciales, ni de Ingesta
 * ni de Transaccion.
 *
 * API asíncrona; retorna Result y NUNCA lanza en el contrato de aplicación.
 */
export interface IIngestaRepository {
  persistirProcesada(
    input: CrearIngestaProcesadaInput,
  ): Promise<
    Result<{ ingestaId: string; total: number }, PersistenciaFallidaError>
  >;
}

/** Token de inyección — las interfaces se borran en runtime. */
export const INGESTA_REPOSITORY = 'IIngestaRepository';
