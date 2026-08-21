import { Result } from '../../../shared/result';
import { EdicionesInvalidasError } from '../../../domain/errors/ediciones-invalidas.error';
import type { CommitEdit } from '../../../application/use-cases/commit-ingesta.use-case';
import type { CommitIngestaResult } from '../../../application/use-cases/commit-ingesta.use-case';

// ---------------------------------------------------------------------------
// parseEdits — infra boundary parser (D-02/D-03)
//
// Parses the raw `edits` multipart text field into a typed CommitEdit[].
// Invalid shapes produce EdicionesInvalidasError with a fixed, scrub-safe
// message — the raw field value is NEVER echoed (ADR-013 amounts scrub).
//
// Shape: Array<{ rowIndex: non-negative integer, categoriaId: string | null }>
// Absent/empty → [] (commit with no overrides is valid — pure auto-classify).
// ---------------------------------------------------------------------------

type ParseFailureCause =
  | 'json-invalido'
  | 'no-es-arreglo'
  | 'elemento-invalido';

const CAUSE_MESSAGES: Record<ParseFailureCause, string> = {
  'json-invalido': 'el campo edits no es un JSON válido',
  'no-es-arreglo': 'el campo edits debe ser un arreglo JSON',
  'elemento-invalido':
    'cada edición requiere rowIndex (entero no negativo) y categoriaId (string o null)',
};

function makeError(cause: ParseFailureCause): EdicionesInvalidasError {
  return new EdicionesInvalidasError(CAUSE_MESSAGES[cause]);
}

function isValidElement(
  el: unknown,
): el is { rowIndex: number; categoriaId: string | null } {
  if (el === null || typeof el !== 'object' || Array.isArray(el)) return false;
  const obj = el as Record<string, unknown>;
  // rowIndex: must be a non-negative integer
  if (
    !('rowIndex' in obj) ||
    typeof obj.rowIndex !== 'number' ||
    !Number.isInteger(obj.rowIndex) ||
    obj.rowIndex < 0
  ) {
    return false;
  }
  // categoriaId: must be string or null (strictly — numbers, booleans, etc. are rejected)
  if (!('categoriaId' in obj)) return false;
  if (obj.categoriaId !== null && typeof obj.categoriaId !== 'string') {
    return false;
  }
  return true;
}

/**
 * parseEdits — parses and shape-validates the `edits` JSON string field at
 * the infra boundary (D-02/D-03).
 *
 * Absent or empty → Result.ok([]).
 * Valid JSON array with correct element shapes → Result.ok(CommitEdit[]).
 * Any shape or parse error → Result.fail(EdicionesInvalidasError) with a
 * closed-enum fixed message that never echoes the raw field value.
 */
export function parseEdits(
  raw: string | undefined,
): Result<CommitEdit[], EdicionesInvalidasError> {
  // Absent or empty → no edits (pure auto-classify commit)
  if (raw === undefined || raw === '') {
    return Result.ok([]);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return Result.fail(makeError('json-invalido'));
  }

  if (!Array.isArray(parsed)) {
    return Result.fail(makeError('no-es-arreglo'));
  }

  for (const el of parsed) {
    if (!isValidElement(el)) {
      return Result.fail(makeError('elemento-invalido'));
    }
  }

  return Result.ok(
    (parsed as Array<{ rowIndex: number; categoriaId: string | null }>).map(
      (el) => ({ rowIndex: el.rowIndex, categoriaId: el.categoriaId }),
    ),
  );
}

// ---------------------------------------------------------------------------
// CommitIngestaResponseDto — NEW DTO independent of IngestaResponseDto (D-13)
//
// The one-shot IngestaResponseDto / TransaccionResponseDto / aIngestaResponseDto
// are NOT modified. This is a parallel, fully-owned DTO for the commit endpoint.
// ---------------------------------------------------------------------------

/**
 * CommitTransaccionResponseDto — HTTP form of a persisted commit transaction.
 *
 * Superset of TransaccionResponseDto: carries `bucket` and `categoriaId`
 * (required by spec CMT-05 — one-shot's TransaccionResponseDto has neither).
 * cargo/abono travel as STRING (BigInt-safe), same contract as the rest.
 * bucket is the serialized Bucket enum string value (D-09/bucket.ts).
 */
export interface CommitTransaccionResponseDto {
  fecha: string;
  descripcion: string;
  cargo: string;
  abono: string;
  /**
   * Serialized Bucket enum value (design §5.2). ALWAYS present for a commit row:
   * commit resolves classification pre-persist (SinCategoria and Ingreso both
   * yield a concrete bucket — see D-11). `bucketId: null` is a one-shot-only
   * pending state that commit never produces, so this is `string`, not `string | null`.
   */
  bucket: string;
  categoriaId: string | null;
}

/**
 * CommitIngestaResponseDto — HTTP contract for POST /api/ingestas/commit (NEW).
 *
 * Distinct from IngestaResponseDto (D-13 — different field set; commit requires
 * bucket+categoriaId per row). The one-shot response shape is NOT changed.
 */
export interface CommitIngestaResponseDto {
  ingestaId: string;
  totalTransacciones: number;
  /** New duplicates found at commit-time dedup — reported, never aborts (D-13). */
  duplicadosOmitidos: number;
  transacciones: ReadonlyArray<CommitTransaccionResponseDto>;
}

/**
 * aCommitIngestaResponseDto — maps CommitIngestaResult to the HTTP contract.
 *
 * Fully independent mapper — does NOT delegate to aIngestaResponseDto (D-13).
 * Maps: BigInt cargo/abono → string; Bucket domain enum → string (enum value
 * is the wire token — D-09). Commit resolves classification pre-persist, so
 * `bucket` is always a concrete enum value here (design §5.2).
 */
export function aCommitIngestaResponseDto(
  result: CommitIngestaResult,
): CommitIngestaResponseDto {
  return {
    ingestaId: result.ingestaId,
    totalTransacciones: result.totalTransacciones,
    duplicadosOmitidos: result.duplicadosOmitidos,
    transacciones: result.transacciones.map((tx) => {
      // Invariant (design §5.2/D-11): a committed row always has a resolved
      // bucket. A null here means the application layer broke that invariant —
      // fail loud at the infra boundary (the route's try/catch → 500) rather
      // than emit a malformed contract. Matches the repo's throw-on-invariant
      // discipline at infrastructure edges (e.g. api-key.middleware).
      if (tx.bucket === null) {
        throw new Error(
          'CommitIngestaResult contiene una transacción con bucket null: ' +
            'el commit debe resolver la clasificación antes de persistir (D-11)',
        );
      }
      return {
        fecha: tx.fecha.toISOString(),
        descripcion: tx.descripcion,
        cargo: String(tx.cargo),
        abono: String(tx.abono),
        // Bucket enum value IS the wire string (bucket.ts:11-17); narrowed to
        // non-null by the invariant guard above, so it assigns to string directly.
        bucket: tx.bucket,
        categoriaId: tx.categoriaId,
      };
    }),
  };
}
