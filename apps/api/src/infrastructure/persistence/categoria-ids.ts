import { Categoria } from '../../domain/value-objects/categoria';

/**
 * CATEGORIA_IDS — ids físicos fijos para las filas seed del usuario bootstrap
 * y para migraciones históricas (US-013, US-037 D-09) — NUNCA un mecanismo
 * de resolución de ids en runtime.
 *
 * Bajo US-037 (catálogo per-user), cada usuario tiene su propia copia de
 * `Categoria` con ids generados (`cuid()`), distintos de estos valores fijos
 * para cualquier usuario que no sea el bootstrap. Ningún código de lectura
 * en runtime debe depender de este mapa para ir de un id físico al enum de
 * dominio — para eso existe `foldCategoria` (fold-categoria.ts), que resuelve
 * por `nombre`, no por id. Este mapa solo sigue vivo porque `seed.ts`
 * necesita ids fijos y estables para que el upsert del usuario bootstrap sea
 * idempotente, y porque migraciones de datos ya aplicadas los referencian.
 */
export const CATEGORIA_IDS: Record<Categoria, string> = {
  [Categoria.Supermercado]: 'categoria-supermercado',
  [Categoria.Combustible]: 'categoria-combustible',
  [Categoria.Farmacia]: 'categoria-farmacia',
  [Categoria.Salud]: 'categoria-salud',
  [Categoria.Transporte]: 'categoria-transporte',
  [Categoria.Streaming]: 'categoria-streaming',
  [Categoria.Delivery]: 'categoria-delivery',
  [Categoria.Ahorro]: 'categoria-ahorro',
};
