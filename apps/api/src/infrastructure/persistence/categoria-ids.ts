import type { CategoriaTemplateClave } from './catalogo-template';

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
 * Tras ADR-042, las claves se re-tipan a `CategoriaTemplateClave` — el
 * universo cerrado de pares `bucket:nombre` que la plantilla define, no solo
 * el nombre (D-02): dos categorías homónimas en buckets distintos ya no
 * podrían compartir clave por construcción. Los VALORES (los ids físicos)
 * NO cambian — son ids ya persistidos en producción; re-keyear este mapa es
 * un refactor de compilación, nunca una migración de datos.
 */
export const CATEGORIA_IDS: Record<CategoriaTemplateClave, string> = {
  'Necesidades:Supermercado': 'categoria-supermercado',
  'Necesidades:Combustible': 'categoria-combustible',
  'Necesidades:Farmacia': 'categoria-farmacia',
  'Necesidades:Salud': 'categoria-salud',
  'Necesidades:Transporte': 'categoria-transporte',
  'Deseos:Streaming': 'categoria-streaming',
  'Deseos:Delivery': 'categoria-delivery',
  'Ahorro:Ahorro': 'categoria-ahorro',
  'Necesidades:Deuda': 'categoria-deuda',
  'Necesidades:Cuentas': 'categoria-cuentas',
  'Necesidades:Internet y telefonía': 'categoria-internet-telefonia',
  'Deseos:Comida': 'categoria-comida',
  'Deseos:Ropa': 'categoria-ropa',
  'Necesidades:Desconocido': 'categoria-desconocido-necesidades',
  'Deseos:Desconocido': 'categoria-desconocido-deseos',
  'Ahorro:Desconocido': 'categoria-desconocido-ahorro',
};
