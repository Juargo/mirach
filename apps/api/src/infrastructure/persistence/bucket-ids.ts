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
