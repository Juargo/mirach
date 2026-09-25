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
 * ID_BUCKET_SINCATEGORIA_LEGACY — el id físico `bucket-sincategoria`, ya NO
 * parte de `BUCKET_IDS` (issue #778 tramo 5b PR5: `Bucket.SinCategoria` salió
 * del dominio). Una fila con este `bucketId` puede seguir existiendo en BD
 * hasta que tramo 6 migre/limpie la columna — no es un bucket, es un id "no
 * reconocido" que debe plegar a `Bucket.Deseos`, igual que un `bucketId` NULL
 * (ver `resolverBucket`/`construirFiltroBucket` abajo). Mantenido como
 * constante nombrada (no un string suelto) para que `resolverBucket` y
 * `construirFiltroBucket` referencien el MISMO literal.
 */
export const ID_BUCKET_SINCATEGORIA_LEGACY = 'bucket-sincategoria';

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
 * keep exactly ONE fold target. This now INCLUDES the legacy
 * `bucket-sincategoria` physical id (issue #778 tramo 5b PR5:
 * `Bucket.SinCategoria` was removed from the domain — that enum member no
 * longer exists, so `BUCKET_ID_TO_BUCKET` has no entry for it and it falls
 * into this same unrecognized-id path). A row with that literal id can
 * still exist in BD until tramo 6 migrates/wipes the column; nothing here
 * rewrites history, it simply reads as "unknown" like any other stale id
 * and folds to `Deseos` — never a silent second "unknown" destination.
 *
 * Shared fold rule for every repository that reads `bucketId` off
 * `Transaccion` (`prisma-resumen-mes.repository.ts`,
 * `prisma-resumen-anual.repository.ts`, `prisma-movimientos-mes.repository.ts`).
 * `prisma-detalle-bucket.repository.ts` reconciles via `construirFiltroBucket`
 * below (a SQL WHERE, not a per-row fold, since it queries ONE bucket at a
 * time) — both are built from the SAME BUCKET_IDS/BUCKET_ID_TO_BUCKET maps
 * so a bucketId can never resolve one way for the WHERE and another way for
 * the in-memory fold. A single resolver is the structural mitigation for
 * the SC-03 rule ("a null-bucket row and a legacy bucket-sincategoria row
 * are DIFFERENT physical values but must fold to the SAME bucket and must
 * never be double-counted"): if each call site re-implemented this mapping,
 * one could silently drift from the others.
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
 * - `Bucket.Deseos` → `bucketId IS NULL` OR the real `bucket-deseos` id OR
 *   the legacy `bucket-sincategoria` id (both are unrecognized-id fold
 *   targets per `resolverBucket` now that `Bucket.SinCategoria` no longer
 *   exists in the domain). Deseos absorbs every "unknown" bucketId, exactly
 *   mirroring the in-memory fold — no row can resolve to Deseos in
 *   `resolverBucket` yet be excluded from this WHERE, or vice versa.
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
      OR: [
        { bucketId: null },
        { bucketId: BUCKET_IDS[Bucket.Deseos] },
        { bucketId: ID_BUCKET_SINCATEGORIA_LEGACY },
      ],
    };
  }
  return { bucketId: BUCKET_IDS[bucket] };
}
