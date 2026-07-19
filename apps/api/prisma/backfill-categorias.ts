import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { assertDestructiveDbAllowed } from '../src/infrastructure/persistence/db-safety';
import { CATEGORIA_IDS } from '../src/infrastructure/persistence/categoria-ids';
import { BUCKET_IDS } from '../src/infrastructure/persistence/bucket-ids';
import { CategorizarTransaccionUseCase } from '../src/application/use-cases/categorizar-transaccion.use-case';
import {
  agruparPorCategoriaBucket,
  type AsignacionCategoriaBucket,
} from '../src/application/services/agrupar-por-categoria-bucket';
import { PatronClasificacion, MatchType } from '../src/domain/value-objects/patron-clasificacion';
import { Categoria } from '../src/domain/value-objects/categoria';
import { Bucket } from '../src/domain/value-objects/bucket';

/**
 * backfill-categorias.ts (US-013 S3, CAT-05).
 *
 * Backfill de UNA vez para las Transaccion existentes: re-corre la
 * clasificación por patrones (la misma CategorizarTransaccionUseCase que usa
 * el pipeline de ingesta — DRY, garantiza consistencia ingest-time vs
 * backfill-time) sobre las filas `categoriaId IS NULL` y escribe
 * `{categoriaId, bucketId}` atómicamente.
 *
 * Scope = `categoriaId IS NULL` (la "nunca tocada manualmente"): entrega a
 * la vez idempotencia (clasificación es función pura de
 * descripcion/cargo/abono/catálogo → mismo resultado en cada corrida),
 * preservación de ediciones manuales (S4 las deja con categoriaId no-null,
 * quedan fuera de scope) y honestidad (una fila que hoy no matchea ningún
 * patrón queda en categoriaId=null/SinCategoria — nunca se inventa una
 * categoría).
 *
 * Estructurado como seed.ts: `runBackfill` es la lógica pura (testeable con
 * un fake client, sin BD — ver backfill-categorias.spec.ts), `main()` es el
 * wiring de script real (gate + PrismaClient) guardado tras
 * `require.main === module`.
 */

/** Cliente mínimo requerido por el backfill (mirror de SeedClient en seed.ts). */
export interface BackfillClient {
  patronClasificacion: {
    findMany(args: {
      include: { categoria: true };
      orderBy: { prioridad: 'asc' };
    }): Promise<
      Array<{
        id: string;
        patron: string;
        matchType: string;
        prioridad: number;
        categoria: { nombre: string };
      }>
    >;
  };
  transaccion: {
    findMany(args: { where: { categoriaId: null } }): Promise<
      Array<{
        id: string;
        descripcion: string;
        cargo: bigint;
        abono: bigint;
        bucketId: string | null;
      }>
    >;
    updateMany(args: {
      where: { id: { in: string[] } };
      data: { categoriaId: string | null; bucketId: string };
    }): Promise<{ count: number }>;
  };
  $transaction<T>(operaciones: Promise<T>[]): Promise<T[]>;
}

export interface BackfillSummary {
  /** Total de filas evaluadas (scope categoriaId IS NULL en esta corrida). */
  readonly totalRows: number;
  /** Conteo por categoría resultante de la clasificación; la clave 'null' agrupa Ingreso/SinCategoria. Incluye filas no escritas (ver decisión por fila). */
  readonly porCategoria: Record<string, number>;
  /**
   * Filas YA bucketeadas (bucketId no nulo) a las que se les agrega
   * categoriaId porque el match es consistente con su bucket actual —
   * el bucket NUNCA cambia en estas filas.
   */
  readonly categoriaAgregadaBucketPreservado: number;
  /**
   * Filas SIN bucket previo (bucketId null) que reciben clasificación
   * completa (categoriaId + bucketId).
   */
  readonly bucketAsignadoDesdeNulo: number;
  /**
   * Filas cuyo bucketId efectivamente cambiaría (preview de movimiento de
   * dinero). Invariante: bajo la regla de preservación, esto SOLO puede
   * contar filas sin bucket previo — una fila ya bucketeada nunca cambia
   * de bucket, así que nunca aparece aquí.
   */
  readonly bucketChanges: number;
}

/**
 * Decide, para UNA fila ya clasificada, si corresponde escribir algo y qué.
 *
 * Regla de preservación (fix/backfill-preserve-bucket):
 *  - `bucketIdAnterior === null` (fila nunca bucketeada): clasificación
 *    completa de siempre — se escriben categoriaId Y bucketId.
 *  - `bucketIdAnterior !== null` (fila YA bucketeada — incluye
 *    SinCategoria/Necesidades/Deseos/Ahorro/Ingreso): el bucket NUNCA se
 *    toca. Solo se agrega categoriaId si el match tiene categoría (no
 *    null) Y el bucket que esa categoría deriva (CATEGORIA_BUCKET) es
 *    EXACTAMENTE el bucket que la fila ya tiene. En cualquier otro caso
 *    (sin match, o match a un bucket distinto) la fila queda intacta —
 *    nunca se mueve una fila ya bucketeada a otro bucket.
 */
function decidirEscritura(c: {
  id: string;
  categoria: Categoria | null;
  bucket: Bucket;
  bucketIdAnterior: string | null;
}): AsignacionCategoriaBucket | null {
  if (c.bucketIdAnterior === null) {
    return { id: c.id, categoria: c.categoria, bucket: c.bucket };
  }
  if (c.categoria !== null && BUCKET_IDS[c.bucket] === c.bucketIdAnterior) {
    return { id: c.id, categoria: c.categoria, bucket: c.bucket };
  }
  return null;
}

export async function runBackfill(
  prisma: BackfillClient,
  options: { dryRun: boolean },
): Promise<BackfillSummary> {
  // 1. Catálogo categoría-aware (mismo formato que PrismaCatalogoClasificacionRepository).
  const patronRows = await prisma.patronClasificacion.findMany({
    include: { categoria: true },
    orderBy: { prioridad: 'asc' },
  });
  const patrones: ReadonlyArray<PatronClasificacion> = patronRows.map(
    (row) =>
      new PatronClasificacion({
        id: row.id,
        patron: row.patron,
        matchType: row.matchType as MatchType,
        categoria: row.categoria.nombre as Categoria,
        prioridad: row.prioridad,
      }),
  );

  // 2. Scope: solo filas nunca tocadas manualmente (categoriaId IS NULL, S4).
  // OJO: dentro de este scope el bucketId puede ya ser NO nulo (filas
  // categorizadas por bucket antes de US-013) — de ahí la regla de
  // preservación de abajo.
  const rows = await prisma.transaccion.findMany({ where: { categoriaId: null } });

  const useCase = new CategorizarTransaccionUseCase();
  const clasificadas = rows.map((row) => {
    const { categoria, bucket } = useCase
      .execute({ descripcion: row.descripcion, cargo: row.cargo, abono: row.abono }, patrones)
      .getValue();
    return { id: row.id, categoria, bucket, bucketIdAnterior: row.bucketId };
  });

  // 3. Resumen + decisión de escritura por fila (siempre calculado — dry-run
  // y run real comparten esta pasada).
  const porCategoria: Record<string, number> = {};
  let categoriaAgregadaBucketPreservado = 0;
  let bucketAsignadoDesdeNulo = 0;
  let bucketChanges = 0;
  const aEscribir: AsignacionCategoriaBucket[] = [];

  for (const c of clasificadas) {
    const key = c.categoria ?? 'null';
    porCategoria[key] = (porCategoria[key] ?? 0) + 1;

    const asignacion = decidirEscritura(c);
    if (asignacion === null) continue;
    aEscribir.push(asignacion);

    if (c.bucketIdAnterior === null) {
      bucketAsignadoDesdeNulo++;
      bucketChanges++; // invariante: solo filas sin bucket previo cuentan aquí
    } else {
      categoriaAgregadaBucketPreservado++;
    }
  }

  // 4. Escritura (omitida en dry-run) — agrupada por (categoria,bucket) igual
  // que PrismaTransaccionBucketRepository: dos categorías distintas que
  // derivan al mismo bucket deben seguir siendo grupos separados. Grouping
  // es lógica pura compartida (DRY, ver agrupar-por-categoria-bucket.ts);
  // el WHERE (id IN, sin ingestaId — scope global del backfill) es propio.
  // Solo entran `aEscribir` — filas sin decisión (ver decidirEscritura)
  // quedan completamente fuera de este paso, nunca se les escribe nada.
  if (!options.dryRun && aEscribir.length > 0) {
    const grupos = agruparPorCategoriaBucket(aEscribir);

    const operaciones = grupos.map(({ categoria, bucket, ids }) =>
      prisma.transaccion.updateMany({
        where: { id: { in: ids } },
        data: {
          categoriaId: categoria ? CATEGORIA_IDS[categoria] : null,
          bucketId: BUCKET_IDS[bucket],
        },
      }),
    );

    await prisma.$transaction(operaciones);
  }

  return {
    totalRows: rows.length,
    porCategoria,
    categoriaAgregadaBucketPreservado,
    bucketAsignadoDesdeNulo,
    bucketChanges,
  };
}

function printSummary(summary: BackfillSummary, dryRun: boolean): void {
  console.log(`Backfill de categorías${dryRun ? ' (--dry-run, nada se escribió)' : ''}:`);
  console.log(`  Filas evaluadas (categoriaId IS NULL): ${summary.totalRows}`);
  console.log('  Por categoría (clasificación, incluye filas no escritas):', summary.porCategoria);
  console.log(
    `  Filas ya bucketeadas que ganan categoría (bucket preservado): ${summary.categoriaAgregadaBucketPreservado}`,
  );
  console.log(
    `  Filas sin bucket previo que reciben bucket (clasificación completa): ${summary.bucketAsignadoDesdeNulo}`,
  );
  console.log(
    `  Filas cuyo bucket cambiaría (solo filas sin bucket previo — nunca una ya bucketeada): ${summary.bucketChanges}`,
  );
}

/**
 * Wiring de script real: gate de seguridad ANTES de cualquier conexión a
 * Prisma (ver assertDestructiveDbAllowed) + ejecución de runBackfill.
 * Exportado para poder testear el gate sin BD (ver backfill-categorias.spec.ts).
 */
export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const dryRun = argv.includes('--dry-run');

  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('backfill-categorias requiere DATABASE_URL o DIRECT_URL en el entorno.');
  }
  // El backfill lee y (salvo --dry-run) muta la BD: exige opt-in explícito y
  // rechaza cadenas de producción, incluso en modo dry-run (misma postura
  // que seed.ts — nunca conectar a producción sin la misma fricción).
  //
  // Única excepción angosta: este backfill (y SOLO este) puede correr una
  // vez, supervisado, contra producción — para eso el operador debe setear
  // AMBOS ALLOW_DESTRUCTIVE_DB=1 y CONFIRM_PROD_BACKFILL con el valor exacto
  // de abajo. seed.ts y los int-specs NO pasan este opt-in y siguen
  // rechazando producción sin excepción.
  assertDestructiveDbAllowed({
    connectionString,
    allowProductionAck: {
      envVar: 'CONFIRM_PROD_BACKFILL',
      expected: 'us-013-transaccion-categorias',
      operation: 'US-013 transaccion categoria backfill',
    },
  });

  const prisma = new PrismaClient({ adapter: new PrismaPg(connectionString) });
  try {
    const summary = await runBackfill(prisma, { dryRun });
    printSummary(summary, dryRun);
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecuta solo como script (ts-node), no al importarse en tests.
if (require.main === module) {
  main()
    .then(() => {
      console.log('Backfill completado.');
    })
    .catch((error) => {
      console.error('Backfill falló:', error);
      process.exitCode = 1;
    });
}
