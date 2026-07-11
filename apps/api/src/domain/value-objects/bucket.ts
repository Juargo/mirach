/**
 * Bucket — value object (enum) que representa las 5 categorías presupuestarias
 * del sistema 50/30/20 (US-012).
 *
 * Los valores son exactos y fijos en MVP. Agregar un nuevo bucket requiere un
 * cambio deliberado de schema/seed, no un string arbitrario.
 *
 * El id físico de cada bucket en la BD vive en infraestructura (bucket-ids.ts);
 * el dominio solo conoce estas etiquetas semánticas.
 */
export enum Bucket {
  Necesidades = 'Necesidades',
  Deseos = 'Deseos',
  Ahorro = 'Ahorro',
  Ingreso = 'Ingreso',
  SinCategoria = 'SinCategoria',
}
