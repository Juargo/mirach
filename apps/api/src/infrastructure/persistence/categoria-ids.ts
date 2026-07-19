import { Categoria } from '../../domain/value-objects/categoria';

/**
 * CATEGORIA_IDS — mapa de ids físicos fijos para las Categoria (US-013).
 *
 * Los ids son fijos (no autogenerados) para que el seed sea idempotente y la
 * sincronización enum↔fila de BD esté single-sourced. Mirror de BUCKET_IDS
 * (bucket-ids.ts) — mismo patrón, mismas garantías.
 *
 * Infra constraint: estos ids deben coincidir exactamente con los rows que
 * inserta seed.ts vía upsert. Cambiar un id aquí requiere también una nueva
 * migración de datos que actualice los categoriaId existentes.
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

/**
 * CATEGORIA_ID_TO_CATEGORIA — inverse map: physical categoriaId string →
 * domain Categoria enum.
 *
 * Built once at module load from CATEGORIA_IDS (single source of truth,
 * DRY). Mirror de BUCKET_ID_TO_BUCKET — usado por los repos que necesitan
 * plegar un categoriaId crudo de Prisma de vuelta al enum de dominio (US-013
 * S5: movimientos / detalle-bucket read paths).
 */
export const CATEGORIA_ID_TO_CATEGORIA: ReadonlyMap<string, Categoria> = new Map(
  (Object.entries(CATEGORIA_IDS) as [Categoria, string][]).map(
    ([categoria, id]) => [id, categoria] as [string, Categoria],
  ),
);

/**
 * foldCategoriaId — pliega un `categoriaId` físico crudo de Prisma a la forma
 * de dominio `{ id, nombre }` (US-013 CATAPI-05).
 *
 * `null` → `null` (Ingreso/SinCategoria). Un id no-null no reconocido en
 * `CATEGORIA_ID_TO_CATEGORIA` también pliega a `null` (defensive — mismo
 * criterio que el fold de bucket en prisma-movimientos-mes.repository.ts).
 *
 * Extraído como función compartida (no duplicada inline) porque exactamente
 * dos repos (movimientos, detalle-bucket) necesitan el mismo fold
 * correctness-critical: una divergencia entre ambos rompería CATAPI-05 de
 * forma silenciosa (DRY — ver .claude/skills/dry/SKILL.md).
 */
export function foldCategoriaId(
  categoriaId: string | null,
): { id: string; nombre: Categoria } | null {
  if (categoriaId === null) return null;
  const nombre = CATEGORIA_ID_TO_CATEGORIA.get(categoriaId);
  return nombre === undefined ? null : { id: categoriaId, nombre };
}
