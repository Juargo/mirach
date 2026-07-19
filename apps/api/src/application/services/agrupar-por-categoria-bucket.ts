import { Bucket } from '../../domain/value-objects/bucket';
import { Categoria } from '../../domain/value-objects/categoria';

export interface AsignacionCategoriaBucket {
  readonly id: string;
  readonly categoria: Categoria | null;
  readonly bucket: Bucket;
}

export interface GrupoCategoriaBucket {
  readonly categoria: Categoria | null;
  readonly bucket: Bucket;
  readonly ids: string[];
}

/** Clave de agrupación estable: `categoria` puede ser null (Ingreso/SinCategoria). */
export function claveCategoriaBucket(categoria: Categoria | null, bucket: Bucket): string {
  return `${categoria ?? ' '}::${bucket}`;
}

/**
 * agruparPorCategoriaBucket — agrupa asignaciones por la clave compuesta
 * (categoria, bucket) (US-013 S3, DRY).
 *
 * Extraída de PrismaTransaccionBucketRepository y backfill-categorias.ts,
 * que duplicaban esta misma lógica de agrupación (solo difieren en el WHERE
 * de la escritura: scope por ingestaId vs scope global). Dos categorías
 * distintas que derivan al MISMO bucket (p.ej. Supermercado y Combustible →
 * Necesidades) deben seguir siendo grupos separados, porque categoriaId
 * difiere aunque bucketId coincida.
 *
 * Pura — sin I/O, sin Prisma, sin NestJS. No muta el array de entrada.
 */
export function agruparPorCategoriaBucket(
  asignaciones: ReadonlyArray<AsignacionCategoriaBucket>,
): GrupoCategoriaBucket[] {
  const porGrupo = new Map<
    string,
    { categoria: Categoria | null; bucket: Bucket; ids: string[] }
  >();

  for (const { id, categoria, bucket } of asignaciones) {
    const key = claveCategoriaBucket(categoria, bucket);
    const grupo = porGrupo.get(key) ?? { categoria, bucket, ids: [] };
    grupo.ids.push(id);
    porGrupo.set(key, grupo);
  }

  return Array.from(porGrupo.values());
}
