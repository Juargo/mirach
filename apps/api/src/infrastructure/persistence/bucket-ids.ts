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
  [Bucket.SinCategoria]: 'bucket-sincategoria',
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
 * `null` bucketId → `Bucket.Deseos`. `Bucket.SinCategoria` as a null-fold
 * TARGET was retired: the only remaining source of `bucketId IS NULL` rows
 * is the documented residual risk in `ProcessIngestaUseCase.revertirYRechazar`
 * (the revert-the-revert failure, see its docblock) — a genuine "we don't
 * know" state, not a real user-facing bucket. It folds to `Deseos` — same
 * `BUCKET_POR_DEFECTO` destination the ingesta pipeline already uses for
 * unclassified money (`categoria-por-defecto.ts`) — so unrecognized money
 * lands in the narrowest semaphore band (≤30%) and stays visibly noisy
 * instead of parking silently in a pseudo-bucket nobody watches.
 *
 * Unrecognized non-null bucketId (a row referencing an id outside
 * `BUCKET_ID_TO_BUCKET` — integrity anomaly, should never happen given the
 * FK) also folds to `Deseos`, for the SAME reason and to keep exactly ONE
 * fold target: two different "unknown" destinations (null → Deseos,
 * corrupt-id → SinCategoria) would silently split one anomaly into two
 * numbers on two different screens, each individually under-reporting it.
 *
 * The REAL `bucket-sincategoria` physical id still resolves to
 * `Bucket.SinCategoria` — that enum member and its BUCKET_IDS row are kept
 * on purpose (tramo 5b does NOT remove them; tramo 6 does) so a literal
 * `bucket-sincategoria` row — none should be written anymore, but nothing
 * here rewrites history — keeps reading as what it physically is.
 *
 * Shared fold rule for every repository that reads `bucketId` off
 * `Transaccion` (`prisma-resumen-mes.repository.ts`,
 * `prisma-resumen-anual.repository.ts`, `prisma-movimientos-mes.repository.ts`).
 * `prisma-detalle-bucket.repository.ts` reconciles via `construirFiltroBucket`
 * below (a SQL WHERE, not a per-row fold, since it queries ONE bucket at a
 * time) — both are built from the SAME BUCKET_IDS/BUCKET_ID_TO_BUCKET maps
 * so a bucketId can never resolve one way for the WHERE and another way for
 * the in-memory fold. A single resolver is the structural mitigation for
 * the SC-03 rule ("a null-bucket row and a real bucket-sincategoria row are
 * DIFFERENT groups and must never merge"): if each call site
 * re-implemented this mapping, one could silently drift from the others.
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
 *   (the null-fold target, see `resolverBucket`).
 * - `Bucket.SinCategoria` → ONLY the real `bucket-sincategoria` id — no
 *   longer an `OR` with null (that row now belongs to Deseos). Querying
 *   SinCategoria and Deseos must be a PARTITION of all bucketId values
 *   (every row in exactly one), never an overlap — otherwise the same
 *   money would render twice, once per detail screen.
 * - Any other bucket → its own physical id (unrecognized non-null ids never
 *   match ANY of the 5 fixed ids, so they naturally fall out of every
 *   bucket's SQL filter — consistent with `resolverBucket` folding them to
 *   Deseos only in the in-memory path; a corrupt id NEVER matches
 *   `BUCKET_IDS[Bucket.Deseos]` either, so this WHERE alone cannot surface
 *   that anomaly — that's expected, it's an in-memory-fold-only concern).
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
