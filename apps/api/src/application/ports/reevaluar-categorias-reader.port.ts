import { Bucket } from '../../domain/value-objects/bucket';

/**
 * TransaccionParaReevaluar — proyección mínima de una transacción persistida
 * necesaria para re-correr la clasificación por patrones sobre TODO el
 * historial del usuario (`POST /api/transacciones/reevaluar`).
 *
 * A diferencia de `TransaccionParaClasificar` (US-012, scope por ingesta,
 * solo filas nunca clasificadas), esta proyección también trae el estado
 * ACTUAL de clasificación (`categoriaIdActual`, `bucketActual`) — el use case
 * lo necesita para decidir si una fila realmente cambió antes de escribirla
 * (evita updates no-op y es la base del conteo "cuántas filas cambiaron").
 */
export interface TransaccionParaReevaluar {
  readonly id: string;
  readonly descripcion: string;
  readonly cargo: bigint;
  readonly abono: bigint;
  /** Categoría actualmente persistida (antes de reevaluar). */
  readonly categoriaIdActual: string | null;
  /** Bucket actualmente persistido (antes de reevaluar), ya resuelto a enum
   * de dominio — `null` físico se resuelve a `Bucket.SinCategoria` (mismo
   * fold que `resolverBucket`, infra). */
  readonly bucketActual: Bucket;
}

/**
 * IReevaluarCategoriasReader — port de lectura para
 * `POST /api/transacciones/reevaluar`.
 *
 * Lee TODAS las transacciones del usuario (categorizadas o no, sin filtro de
 * período ni de ingesta/origen) — alcance decidido y confirmado (a diferencia
 * de `ITransaccionParaClasificarReader`, que solo lee las de una ingesta).
 *
 * Contrato: retorna siempre un array (vacío si el usuario no tiene
 * transacciones). NUNCA lanza. El aislamiento por `userId` es estructural en
 * el WHERE de la implementación (RNF-SEC-006), nunca un filtro en memoria.
 */
export interface IReevaluarCategoriasReader {
  findTodasDelUsuario(
    userId: string,
  ): Promise<ReadonlyArray<TransaccionParaReevaluar>>;
}

/** Token de inyección — las interfaces se borran en runtime. */
export const REEVALUAR_CATEGORIAS_READER = 'IReevaluarCategoriasReader';
