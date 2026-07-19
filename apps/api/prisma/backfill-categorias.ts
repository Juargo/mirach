import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { assertDestructiveDbAllowed } from '../src/infrastructure/persistence/db-safety';
import { CATEGORIA_IDS } from '../src/infrastructure/persistence/categoria-ids';
import { BUCKET_IDS } from '../src/infrastructure/persistence/bucket-ids';
import { CategorizarTransaccionUseCase } from '../src/application/use-cases/categorizar-transaccion.use-case';
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
  /** Conteo por categoría resultante; la clave 'null' agrupa Ingreso/SinCategoria. */
  readonly porCategoria: Record<string, number>;
  /** Filas cuyo bucketId efectivamente cambiaría respecto al valor actual (preview de movimiento de dinero). */
  readonly bucketChanges: number;
}

/** Clave de agrupación estable: `categoria` puede ser null (Ingreso/SinCategoria). */
function groupKey(categoria: Categoria | null, bucket: Bucket): string {
  return `${categoria ?? ' '}::${bucket}`;
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

  // 2. Scope: solo filas nunca tocadas (ni por ingesta ni manualmente, S4).
  const rows = await prisma.transaccion.findMany({ where: { categoriaId: null } });

  const useCase = new CategorizarTransaccionUseCase();
  const clasificadas = rows.map((row) => {
    const { categoria, bucket } = useCase
      .execute({ descripcion: row.descripcion, cargo: row.cargo, abono: row.abono }, patrones)
      .getValue();
    return { id: row.id, categoria, bucket, bucketIdAnterior: row.bucketId };
  });

  // 3. Resumen (siempre calculado — dry-run y run real lo comparten).
  const porCategoria: Record<string, number> = {};
  let bucketChanges = 0;
  for (const c of clasificadas) {
    const key = c.categoria ?? 'null';
    porCategoria[key] = (porCategoria[key] ?? 0) + 1;
    if (BUCKET_IDS[c.bucket] !== c.bucketIdAnterior) bucketChanges++;
  }

  // 4. Escritura (omitida en dry-run) — agrupada por (categoria,bucket) igual
  // que PrismaTransaccionBucketRepository: dos categorías distintas que
  // derivan al mismo bucket deben seguir siendo grupos separados.
  if (!options.dryRun && clasificadas.length > 0) {
    const porGrupo = new Map<
      string,
      { categoria: Categoria | null; bucket: Bucket; ids: string[] }
    >();
    for (const { id, categoria, bucket } of clasificadas) {
      const key = groupKey(categoria, bucket);
      const grupo = porGrupo.get(key) ?? { categoria, bucket, ids: [] };
      grupo.ids.push(id);
      porGrupo.set(key, grupo);
    }

    const operaciones = Array.from(porGrupo.values()).map(({ categoria, bucket, ids }) =>
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

  return { totalRows: rows.length, porCategoria, bucketChanges };
}

function printSummary(summary: BackfillSummary, dryRun: boolean): void {
  console.log(`Backfill de categorías${dryRun ? ' (--dry-run, nada se escribió)' : ''}:`);
  console.log(`  Filas evaluadas (categoriaId IS NULL): ${summary.totalRows}`);
  console.log('  Por categoría:', summary.porCategoria);
  console.log(`  Filas cuyo bucket cambiaría: ${summary.bucketChanges}`);
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
  assertDestructiveDbAllowed({ connectionString });

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
