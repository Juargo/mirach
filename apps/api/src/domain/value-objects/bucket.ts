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
 * existe como bucket real. Una fila con `bucketId = 'bucket-sincategoria'`
 * (persistida por versiones anteriores, hasta que tramo 6 migre/limpie la
 * columna) es un id "no reconocido" que `resolverBucket`/`construirFiltroBucket`
 * (ver `bucket-ids.ts`) pliegan a `Bucket.Deseos`, igual que un `bucketId`
 * NULL.
 */
export enum Bucket {
  Necesidades = 'Necesidades',
  Deseos = 'Deseos',
  Ahorro = 'Ahorro',
  Ingreso = 'Ingreso',
}
