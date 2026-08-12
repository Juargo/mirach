import type { CategoriaTemplateNombre } from './catalogo-template';

/**
 * CATEGORIA_IDS — ids físicos fijos para las filas seed del usuario bootstrap
 * y para migraciones históricas (US-013, US-037 D-09) — NUNCA un mecanismo
 * de resolución de ids en runtime.
 *
 * Bajo US-037 (catálogo per-user), cada usuario tiene su propia copia de
 * las categorías de la plantilla con ids generados (`cuid()`), distintos de
 * estos valores fijos para cualquier usuario que no sea el bootstrap. Ningún
 * código de lectura en runtime debe depender de este mapa para ir de un id
 * físico a una categoría — para eso existe `foldCategoria`
 * (fold-categoria.ts), que resuelve por `nombre`, no por id. Este mapa solo
 * sigue vivo porque `seed.ts` necesita ids fijos y estables para que el
 * upsert del usuario bootstrap sea idempotente, y porque migraciones de
 * datos ya aplicadas los referencian.
 *
 * Tras ADR-037, las claves se re-tipan a `CategoriaTemplateNombre` — el
 * universo cerrado de nombres que la plantilla define (D-02).
 */
export const CATEGORIA_IDS: Record<CategoriaTemplateNombre, string> = {
  Supermercado: 'categoria-supermercado',
  Combustible: 'categoria-combustible',
  Farmacia: 'categoria-farmacia',
  Salud: 'categoria-salud',
  Transporte: 'categoria-transporte',
  Streaming: 'categoria-streaming',
  Delivery: 'categoria-delivery',
  Ahorro: 'categoria-ahorro',
};
