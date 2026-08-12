import { Bucket } from '../../domain/value-objects/bucket';

export interface AsignacionCategoriaBucket {
  readonly id: string;
  readonly categoriaId: string | null;
  readonly bucket: Bucket;
}

export interface GrupoCategoriaBucket {
  readonly categoriaId: string | null;
  readonly bucket: Bucket;
  readonly ids: string[];
}

/** Clave de agrupación estable: `categoriaId` puede ser null (Ingreso/SinCategoria). */
export function claveCategoriaBucket(
  categoriaId: string | null,
  bucket: Bucket,
): string {
  return `${categoriaId ?? ' '}::${bucket}`;
}

/**
 * agruparPorCategoriaBucket — agrupa asignaciones por la clave compuesta
 * (categoriaId, bucket) (US-013 S3, DRY; re-keyed a id por ADR-037/Q5).
 *
 * Extraída de PrismaTransaccionBucketRepository y backfill-categorias.ts,
 * que duplicaban esta misma lógica de agrupación (solo difieren en el WHERE
 * de la escritura: scope por ingestaId vs scope global). Dos categorías
 * distintas que derivan al MISMO bucket (p.ej. Supermercado y Combustible →
 * Necesidades) deben seguir siendo grupos separados, porque categoriaId
 * difiere aunque bucketId coincida — antes esa distinción viajaba por el
 * enum `Categoria`, ahora viaja por el id real de la fila del usuario.
 *
 * Pura — sin I/O, sin Prisma, sin NestJS. No muta el array de entrada.
 */
export function agruparPorCategoriaBucket(
  asignaciones: ReadonlyArray<AsignacionCategoriaBucket>,
): GrupoCategoriaBucket[] {
  const porGrupo = new Map<
    string,
    { categoriaId: string | null; bucket: Bucket; ids: string[] }
  >();

  for (const { id, categoriaId, bucket } of asignaciones) {
    const key = claveCategoriaBucket(categoriaId, bucket);
    const grupo = porGrupo.get(key) ?? { categoriaId, bucket, ids: [] };
    grupo.ids.push(id);
    porGrupo.set(key, grupo);
  }

  return Array.from(porGrupo.values());
}
