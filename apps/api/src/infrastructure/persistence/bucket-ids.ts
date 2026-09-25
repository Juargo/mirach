import { Bucket } from '../../domain/value-objects/bucket';

/**
 * BUCKET_IDS — mapa de ids físicos fijos para los BucketPresupuesto (US-012).
 *
 * Los ids son fijos (no autogenerados) para que el seed sea idempotente y la
 * sincronización enum↔fila de BD esté single-sourced. El bucket writer y el
 * seed los importan desde aquí para garantizar consistencia.
 *
 * Infra constraint: estos ids deben coincidir exactamente con los rows que
 * inserta seed.ts vía upsert. Cambiar un id aquí requiere también una nueva
 * migración de datos que actualice los bucketId existentes en Transaccion.
 */
export const BUCKET_IDS: Record<Bucket, string> = {
  [Bucket.Necesidades]: 'bucket-necesidades',
  [Bucket.Deseos]: 'bucket-deseos',
  [Bucket.Ahorro]: 'bucket-ahorro',
  [Bucket.Ingreso]: 'bucket-ingreso',
};

/**
 * BUCKET_ID_TO_BUCKET — inverse map: physical bucketId string → domain Bucket enum.
 *
 * Built once at module load from BUCKET_IDS (single source of truth, DRY).
 * Shared by every repository that needs to fold a raw Prisma bucketId back
 * into the domain Bucket enum (prisma-resumen-mes / prisma-resumen-anual).
 */
export const BUCKET_ID_TO_BUCKET: ReadonlyMap<string, Bucket> = new Map(
  (Object.entries(BUCKET_IDS) as [Bucket, string][]).map(
    ([bucket, id]) => [id, bucket] as [string, Bucket],
  ),
);

/**
 * Resolve a physical Prisma bucketId → domain Bucket enum (issue #778 tramo
 * 5b — READ-side fold).
 *
 * `null` bucketId → `Bucket.Deseos`. The only remaining source of
 * `bucketId IS NULL` rows is the documented residual risk in
 * `ProcessIngestaUseCase.revertirYRechazar` (the revert-the-revert failure,
 * see its docblock) — a genuine "we don't know" state, not a real
 * user-facing bucket. It folds to `Deseos` — same `BUCKET_POR_DEFECTO`
 * destination the ingesta pipeline already uses for unclassified money
 * (`categoria-por-defecto.ts`) — so unrecognized money lands in the
 * narrowest semaphore band (≤30%) and stays visibly noisy instead of
 * parking silently in a pseudo-bucket nobody watches.
 *
 * Unrecognized non-null bucketId (a row referencing an id outside
 * `BUCKET_ID_TO_BUCKET`) also folds to `Deseos`, for the SAME reason and to
 * keep exactly ONE fold target — kept as a DEFENSIVE branch (integrity
 * anomaly, should never happen behind the FK) rather than removed. Issue
 * #778 tramo 5b PR6 migrated every row that used to carry the legacy
 * `bucket-sincategoria` physical id to `bucket-deseos` and DELETED that
 * `BucketPresupuesto` row (see its migration) — the FK now makes that
 * specific id physically impossible to write again, so this branch has no
 * currently-known live source, but stays as the single fold target for any
 * future integrity anomaly instead of silently returning nothing.
 *
 * Shared fold rule for every repository that reads `bucketId` off
 * `Transaccion` (`prisma-resumen-mes.repository.ts`,
 * `prisma-resumen-anual.repository.ts`, `prisma-movimientos-mes.repository.ts`).
 * `prisma-detalle-bucket.repository.ts` reconciles via `construirFiltroBucket`
 * below (a SQL WHERE, not a per-row fold, since it queries ONE bucket at a
 * time) — both are built from the SAME BUCKET_IDS/BUCKET_ID_TO_BUCKET maps
 * so a bucketId can never resolve one way for the WHERE and another way for
 * the in-memory fold. A single resolver is the structural mitigation for
 * the SC-03 rule ("a null-bucket row and any other unrecognized bucketId
 * must fold to the SAME bucket and must never be double-counted"): if each
 * call site re-implemented this mapping, one could silently drift from the
 * others.
 */
export function resolverBucket(bucketId: string | null): Bucket {
  return bucketId === null
    ? Bucket.Deseos
    : (BUCKET_ID_TO_BUCKET.get(bucketId) ?? Bucket.Deseos);
}

/**
 * construirFiltroBucket — SQL WHERE fragment for "rows belonging to `bucket`
 * once read-side folding applies", mirroring `resolverBucket` exactly
 * (SC-03: the two MUST reconcile, or a bucket's SQL-filtered detail total
 * would disagree with its in-memory-folded aggregate total).
 *
 * - `Bucket.Deseos` → `bucketId IS NULL` OR the real `bucket-deseos` id
 *   (both are unrecognized/absent-id fold targets per `resolverBucket`).
 *   Deseos absorbs every "unknown" bucketId, exactly mirroring the
 *   in-memory fold — no row can resolve to Deseos in `resolverBucket` yet
 *   be excluded from this WHERE, or vice versa. Issue #778 tramo 5b PR6
 *   dropped the legacy `bucket-sincategoria` id from this OR — every row
 *   that carried it was migrated to the real `bucket-deseos` id and the FK
 *   now makes that legacy id physically impossible to write again (see its
 *   migration), so it no longer needs its own clause here.
 * - Any other bucket → its own physical id (an unrecognized non-null id
 *   never matches any of the 4 fixed ids, so it naturally falls out of
 *   every OTHER bucket's SQL filter — consistent with `resolverBucket`
 *   folding it to Deseos exclusively).
 *
 * Consumed by `prisma-detalle-bucket.repository.ts`.
 */
export function construirFiltroBucket(
  bucket: Bucket,
): { bucketId: string } | { OR: Array<{ bucketId: string | null }> } {
  if (bucket === Bucket.Deseos) {
    return {
      OR: [{ bucketId: null }, { bucketId: BUCKET_IDS[Bucket.Deseos] }],
    };
  }
  return { bucketId: BUCKET_IDS[bucket] };
}
