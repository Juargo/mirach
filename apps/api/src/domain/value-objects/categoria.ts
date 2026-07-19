import { Bucket } from './bucket';

/**
 * Categoria — value object (enum) que representa la taxonomía FINAL de
 * categorías de transacción (US-013), un nivel más fino que Bucket.
 *
 * Los valores son exactos y fijos en MVP (catálogo seed-only, sin categorías
 * creadas por el usuario — ver Non-Goals de categorias-model). Cada categoría
 * pertenece a exactamente un bucket (ver CATEGORIA_BUCKET).
 *
 * El id físico de cada categoría en la BD vive en infraestructura
 * (categoria-ids.ts); el dominio solo conoce estas etiquetas semánticas.
 */
export enum Categoria {
  Supermercado = 'Supermercado',
  Combustible = 'Combustible',
  Farmacia = 'Farmacia',
  Salud = 'Salud',
  Transporte = 'Transporte',
  Streaming = 'Streaming',
  Delivery = 'Delivery',
  Ahorro = 'Ahorro',
}

/**
 * CATEGORIA_BUCKET — el invariante "una categoría pertenece a exactamente un
 * bucket" (CAT-01), expresado como dato puro. `Record<Categoria, Bucket>` es
 * TOTAL sobre el enum: el compilador garantiza que ninguna categoría queda
 * sin bucket (no hay categorías huérfanas).
 *
 * Esta es la única fuente de verdad del mapeo categoría→bucket. El bucket de
 * una transacción SIEMPRE se DERIVA de aquí cuando hay una categoría asignada
 * — nunca se acepta ni se guarda independientemente (ver design.md §2).
 */
export const CATEGORIA_BUCKET: Record<Categoria, Bucket> = {
  [Categoria.Supermercado]: Bucket.Necesidades,
  [Categoria.Combustible]: Bucket.Necesidades,
  [Categoria.Farmacia]: Bucket.Necesidades,
  [Categoria.Salud]: Bucket.Necesidades,
  [Categoria.Transporte]: Bucket.Necesidades,
  [Categoria.Streaming]: Bucket.Deseos,
  [Categoria.Delivery]: Bucket.Deseos,
  [Categoria.Ahorro]: Bucket.Ahorro,
};

/** Deriva el bucket de una categoría vía CATEGORIA_BUCKET (nunca lanza). */
export function bucketDeCategoria(categoria: Categoria): Bucket {
  return CATEGORIA_BUCKET[categoria];
}
