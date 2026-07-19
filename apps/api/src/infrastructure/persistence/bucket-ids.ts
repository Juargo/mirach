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
