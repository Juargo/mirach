import { Bucket } from './bucket';

/**
 * Resumen de clasificación de una vista previa de ingesta: cómo quedaron
 * repartidas las filas entre buckets y categorías ANTES de confirmar.
 *
 * Es la fuente de la pantalla «Vista previa» (04): un acordeón bucket →
 * categoría → movimiento con conteos y totales. Las sumas viven acá, en el
 * dominio y en BigInt, para que ningún cliente tenga que sumar dinero.
 *
 * Reglas:
 *   - Las filas duplicadas (`esDuplicado`) no entran en nada: el commit las
 *     omite, así que no son parte de lo que se va a guardar.
 *   - Las filas de ingreso (bucket `Ingreso`) van aparte, con total de abono.
 *   - Los buckets salen en el orden fijo Necesidades, Deseos, Ahorro y solo
 *     cuando tienen filas. Dentro de un bucket, las categorías van por total
 *     descendente y, a igual total, por nombre.
 *   - `desconocidos` cuenta las filas de gasto que cayeron en la `Desconocido`
 *     por defecto (CLA-13) o que no tienen categoría.
 */
export interface FilaClasificadaPreview {
  readonly rowIndex: number;
  readonly cargo: bigint;
  readonly abono: bigint;
  readonly esDuplicado: boolean;
  readonly bucket: Bucket;
  readonly categoria: { readonly id: string; readonly nombre: string } | null;
}

export interface CategoriaClasificacionPreview {
  readonly categoriaId: string | null;
  readonly nombre: string;
  readonly cantidad: number;
  readonly total: bigint;
  readonly filas: ReadonlyArray<number>;
}

export interface BucketClasificacionPreview {
  readonly bucket: Bucket;
  readonly cantidad: number;
  readonly total: bigint;
  readonly categorias: ReadonlyArray<CategoriaClasificacionPreview>;
}

export interface ResumenClasificacionPreview {
  readonly ingresos: { readonly cantidad: number; readonly total: bigint };
  readonly buckets: ReadonlyArray<BucketClasificacionPreview>;
  readonly desconocidos: number;
}

const ORDEN_BUCKETS: ReadonlyArray<Bucket> = [
  Bucket.Necesidades,
  Bucket.Deseos,
  Bucket.Ahorro,
];

/** Nombre que recibe una fila de gasto sin categoría (no debería ocurrir hoy). */
const NOMBRE_SIN_CATEGORIA = 'Desconocido';

interface Acumulador {
  categoriaId: string | null;
  nombre: string;
  total: bigint;
  filas: number[];
}

export function agruparClasificacionPreview(
  filas: ReadonlyArray<FilaClasificadaPreview>,
  categoriaDesconocidaId: string,
): ResumenClasificacionPreview {
  const ingresos = { cantidad: 0, total: 0n };
  let desconocidos = 0;
  const porBucket = new Map<Bucket, Map<string, Acumulador>>();

  for (const fila of filas) {
    if (fila.esDuplicado) continue;

    if (fila.bucket === Bucket.Ingreso) {
      ingresos.cantidad += 1;
      ingresos.total += fila.abono;
      continue;
    }

    const categoriaId = fila.categoria?.id ?? null;
    if (categoriaId === null || categoriaId === categoriaDesconocidaId) {
      desconocidos += 1;
    }

    const categorias =
      porBucket.get(fila.bucket) ?? new Map<string, Acumulador>();
    porBucket.set(fila.bucket, categorias);

    const clave = categoriaId ?? '';
    const acumulador = categorias.get(clave) ?? {
      categoriaId,
      nombre: fila.categoria?.nombre ?? NOMBRE_SIN_CATEGORIA,
      total: 0n,
      filas: [],
    };
    acumulador.total += fila.cargo;
    acumulador.filas.push(fila.rowIndex);
    categorias.set(clave, acumulador);
  }

  const buckets: BucketClasificacionPreview[] = [];
  for (const bucket of ORDEN_BUCKETS) {
    const categorias = porBucket.get(bucket);
    if (!categorias) continue;

    const ordenadas = [...categorias.values()]
      .sort(compararCategorias)
      .map((c) => ({
        categoriaId: c.categoriaId,
        nombre: c.nombre,
        cantidad: c.filas.length,
        total: c.total,
        filas: [...c.filas].sort((a, b) => a - b),
      }));

    buckets.push({
      bucket,
      cantidad: ordenadas.reduce((n, c) => n + c.cantidad, 0),
      total: ordenadas.reduce((t, c) => t + c.total, 0n),
      categorias: ordenadas,
    });
  }

  return { ingresos, buckets, desconocidos };
}

function compararCategorias(a: Acumulador, b: Acumulador): number {
  if (a.total !== b.total) return a.total > b.total ? -1 : 1;
  return a.nombre.localeCompare(b.nombre, 'es');
}
