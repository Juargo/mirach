/**
 * Bucket — value object (enum) que representa las 4 categorías presupuestarias
 * del sistema 50/30/20 (US-012).
 *
 * Los valores son exactos y fijos en MVP. Agregar un nuevo bucket requiere un
 * cambio deliberado de schema/seed, no un string arbitrario.
 *
 * El id físico de cada bucket en la BD vive en infraestructura (bucket-ids.ts);
 * el dominio solo conoce estas etiquetas semánticas.
 *
 * `SinCategoria` fue removido del dominio (issue #778 tramo 5b PR5): ya no
 * existe como bucket real. Tramo 5b PR6 retiró también el remanente físico
 * — la migración de datos movió toda fila con el id legacy
 * `bucket-sincategoria` a `bucket-deseos` y borró esa `BucketPresupuesto`,
 * así que la FK hace ese id imposible de reescribir. Cualquier `bucketId`
 * NULL (o, defensivamente, un id no reconocido — integridad anómala) sigue
 * plegando a `Bucket.Deseos` vía `resolverBucket`/`construirFiltroBucket`
 * (ver `bucket-ids.ts`).
 */
export enum Bucket {
  Necesidades = 'Necesidades',
  Deseos = 'Deseos',
  Ahorro = 'Ahorro',
  Ingreso = 'Ingreso',
}
