import { DetalleBucketRow } from '../ports/detalle-bucket.port';

/**
 * GrupoDetalleCategoria — grupo de transacciones del detalle MES-BUCKET
 * (US-051) con el subtotal en BigInt (la serialización a string ocurre solo
 * en el DTO HTTP — D-06).
 */
export interface GrupoDetalleCategoria {
  /** null solo para el grupo sintético "Sin categoría". */
  readonly categoriaId: string | null;
  readonly nombre: string;
  readonly subtotal: bigint;
  readonly conteo: number;
  /** Orden del reader preservado (fecha asc, id asc) — no se re-ordena. */
  readonly transacciones: ReadonlyArray<DetalleBucketRow>;
}

interface GrupoAcumulador {
  readonly categoriaId: string | null;
  readonly nombre: string;
  subtotal: bigint;
  readonly transacciones: DetalleBucketRow[];
}

const NOMBRE_SIN_CATEGORIA = 'Sin categoría';
const CLAVE_SIN_CATEGORIA = 'sin-categoria';

/**
 * Orden alfabético es-CL, con "Sin categoría" SIEMPRE al final. Espeja el
 * helper web `agrupar-detalle-por-categoria.ts` (US-013 WCAT-02): el locale
 * es EXPLÍCITO porque los nombres creados por el usuario llevan tildes y ñ y
 * la colación por defecto depende del ICU del runtime.
 */
function compararGrupos(a: string, b: string): number {
  if (a === NOMBRE_SIN_CATEGORIA) return b === NOMBRE_SIN_CATEGORIA ? 0 : 1;
  if (b === NOMBRE_SIN_CATEGORIA) return -1;
  return a.localeCompare(b, 'es-CL');
}

/**
 * agruparDetallePorCategoria — servicio puro que agrupa las transacciones de
 * UN bucket (ya validadas por el use case, D-08) por `categoriaId` (D-03).
 *
 * Espeja las reglas documentadas del helper web `agrupar-detalle-por-categoria.ts`
 * (misma 3ª implementación de agrupación — deliberadamente SIN abstracción
 * cross-layer, ADR-005/008):
 * - clave de grupo: `categoriaId` (filas con `categoria: null` → grupo
 *   sintético "Sin categoría" con `categoriaId: null`);
 * - subtotal = Σ `cargo` en BigInt (el allowlist del use case excluye
 *   Ingreso, así que no hay rama defensiva abono — D-03);
 * - grupos ordenados por `nombre` es-CL, "Sin categoría" siempre al final;
 * - solo categorías presentes (nunca grupos vacíos); input vacío → `[]`;
 * - las `transacciones` de cada grupo preservan el orden del reader.
 *
 * Pura: sin I/O, sin excepciones, sin math float (ADR-015).
 */
export function agruparDetallePorCategoria(
  filas: ReadonlyArray<DetalleBucketRow>,
): ReadonlyArray<GrupoDetalleCategoria> {
  const grupos = new Map<string, GrupoAcumulador>();

  for (const fila of filas) {
    const clave = fila.categoria?.id ?? CLAVE_SIN_CATEGORIA;
    const existente = grupos.get(clave);
    if (existente) {
      existente.subtotal += fila.cargo;
      existente.transacciones.push(fila);
      continue;
    }
    grupos.set(clave, {
      categoriaId: fila.categoria?.id ?? null,
      nombre: fila.categoria?.nombre ?? NOMBRE_SIN_CATEGORIA,
      subtotal: fila.cargo,
      transacciones: [fila],
    });
  }

  return Array.from(grupos.values())
    .sort((a, b) => compararGrupos(a.nombre, b.nombre))
    .map((grupo) => ({
      categoriaId: grupo.categoriaId,
      nombre: grupo.nombre,
      subtotal: grupo.subtotal,
      conteo: grupo.transacciones.length,
      transacciones: grupo.transacciones,
    }));
}
