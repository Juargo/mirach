import { Result } from '../../shared/result';
import { PersistenciaFallidaError } from '../../domain/errors/persistencia-fallida.error';
import { Transaccion } from '../../domain/value-objects/transaccion';
import { Bucket } from '../../domain/value-objects/bucket';

/**
 * TransaccionAPersistir — envuelve una transacción de dominio con la
 * clasificación resuelta EN MEMORIA por el use case caller (US-057, D-11).
 *
 * `bucket` es el enum de DOMINIO (nunca la FK física). La resolución
 * `Bucket → BUCKET_IDS[bucket]` vive EXCLUSIVAMENTE en el adapter
 * `aPersistencia` (transaccion.mapper.ts, D-15 / ADR-005: la application
 * layer no puede importar BUCKET_IDS que vive en infrastructure).
 *
 * One-shot callers (`ProcessIngestaUseCase`) pasan `{ transaccion, bucket: null,
 * categoriaId: null }` → `aPersistencia` produce `{ bucketId: null, categoriaId: null }`,
 * byte-for-byte idéntico al comportamiento previo (regression guard D-11).
 * Commit callers (`CommitIngestaUseCase`) pasan el bucket y categoría resueltos
 * en memoria antes de llamar a `PersistTransactionsUseCase`.
 */
export interface TransaccionAPersistir {
  transaccion: Transaccion;
  /** Bucket de dominio resuelto en memoria. `null` = categorización pendiente/fallida (one-shot). */
  bucket: Bucket | null;
  /** Id de categoría propio del usuario. `null` = sin categoría asignada. */
  categoriaId: string | null;
}

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
  /** US-057 retype: cada entrada envuelve la transacción + clasificación resuelta. */
  transacciones: ReadonlyArray<TransaccionAPersistir>;
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
