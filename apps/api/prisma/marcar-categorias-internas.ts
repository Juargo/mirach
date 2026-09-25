import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { assertDestructiveDbAllowed } from '../src/infrastructure/persistence/db-safety';
import { Bucket } from '../src/domain/value-objects/bucket';

/**
 * marcar-categorias-internas.ts (issue #778, CA-07 — remediación del
 * backfill de tramo 4).
 *
 * ── El problema que remedia ──────────────────────────────────────────────
 *
 * El commit `e8c20b78` agregó `Categoria.esInterna` SIN backfill, a
 * propósito: "ninguna fila existente cambia de naturaleza". Consecuencia
 * real, verificada contra una BD de producción: las tres `Desconocido` que
 * ya existían en un usuario quedan con `esInterna = false`. Cualquier
 * consumidor con la misma precondición (`seleccionarCategoriaInterna`, que
 * filtra por `esInterna === true` — p. ej. el `backfill-desconocido.ts` de
 * tramo 4, retirado en tramo 5b PR6 por quedar superseded por la migración
 * de datos de esa PR) las trata como si no existieran, y aborta mandando a
 * `backfill-catalogo-faltante.ts` — un script que solo hace
 * `categoria.createMany` y por lo tanto SALTEA la fila por duplicado
 * (`@@unique([userId, bucketId, nombre])`) sin tocar `esInterna` nunca. Sin
 * este script, ese consumidor queda abortando para siempre en cualquier
 * usuario con catálogo pre-#778.
 *
 * Esta es la remediación deliberada de esa laguna: marcar, para UN usuario
 * y bajo supervisión, las `Desconocido` preexistentes que de verdad son la
 * categoría interna del sistema.
 *
 * ── Por qué identificar por `(bucketId, nombre = 'Desconocido')` acá SÍ ──
 *
 * El propio schema (comentario de `Categoria.esInterna`) y `e8c20b78`
 * rechazaron el NOMBRE como handle PERMANENTE para "es la Desconocido del
 * sistema" — con razón: la identidad real de una categoría es `(userId,
 * bucketId, nombre)`, el nombre es exactamente el campo que el usuario
 * puede editar, y si el nombre fuera el handle, renombrar cualquier
 * categoría propia a "Desconocido" la volvería intocable para siempre (y
 * renombrar la real la desprotegería). Por eso el guard de dominio
 * (`CategoriaInternaProtegidaError`) y `seleccionarCategoriaInterna` NUNCA
 * miran el nombre — solo `esInterna`.
 *
 * Este script es harina de otro costal: es una corrida ÚNICA, manual, por
 * usuario explícito (`--user`, sin `--all`), con `--dry-run` que imprime
 * fila por fila (id + bucket + nombre) ANTES de escribir, y que ADEMÁS
 * aborta sin escribir si encuentra más de una candidata en un bucket (ver
 * más abajo). No queda ningún camino de código que seguirá usando el nombre
 * después de esta corrida — `esInterna` sigue siendo la única marca que el
 * resto del sistema consulta. El nombre acá es el único handle que EXISTE
 * para identificar "cuál fila es la Desconocido preexistente" en un momento
 * en el que `esInterna` es precisamente el dato que falta escribir; usarlo
 * bajo supervisión humana, una vez, con abort-on-ambiguity, no reintroduce
 * el riesgo que `e8c20b78` evitó (un nombre que el sistema trata como
 * mágico en producción continua).
 *
 * ── Reglas de seguridad propias ──────────────────────────────────────────
 *
 * - Solo toca `Categoria` con `nombre = 'Desconocido'` Y `esInterna = false`
 *   en los tres buckets ASIGNABLES (Necesidades, Deseos, Ahorro). Nunca en
 *   `Ingreso` — no es un bucket que `seleccionarCategoriaInterna` resuelva
 *   jamás, así que tampoco tiene sentido marcar nada ahí. `SinCategoria` ya
 *   ni siquiera existe como bucket (issue #778 tramo 5b).
 * - Si un bucket asignable tiene MÁS DE UNA fila `nombre = 'Desconocido'`,
 *   el script ABORTA SIN ESCRIBIR NADA (ni en ese bucket ni en los otros) y
 *   lista los ids candidatos. Eso significaría un catálogo con datos raros
 *   (dos categorías con el mismo nombre en el mismo bucket no debería ser
 *   posible bajo `@@unique([userId, bucketId, nombre])`, pero este script
 *   no confía en esa invariante para decidir algo irreversible en la
 *   práctica — marcar la fila equivocada como interna la vuelve intocable
 *   por el resto del sistema).
 * - Si ya está en `esInterna = true`, no se toca — se reporta aparte como
 *   "ya marcada", no como candidata.
 * - Si un bucket no tiene ninguna `Desconocido`, no falla: se reporta como
 *   "falta" (ese caso lo resuelve `backfill-catalogo-faltante.ts`, no este
 *   script).
 * - Todo WHERE (lectura y escritura) filtra por `userId` — aislamiento
 *   multi-tenant (RNF-SEC-006).
 * - Toda escritura ocurre dentro de una única `$transaction`.
 *
 * ── Estructura ────────────────────────────────────────────────────────────
 *
 * Mismo patrón que los backfills vecinos: `runMarcarCategoriasInternas` es
 * la lógica pura (testeable con un fake client, sin BD — ver
 * `marcar-categorias-internas.spec.ts`), `main()` es el wiring de script
 * real (gate + PrismaClient), guardado tras `require.main === module`.
 * `--dry-run` no abre transacción ni escribe nada — el cómputo de
 * candidatas, ya-marcadas y faltantes corre igual, para que el operador
 * revise la lista exacta (id + bucket + nombre) antes de escribir de
 * verdad.
 *
 * No se loguea descripción ni monto (no aplica — esta tabla no tiene esas
 * columnas). Nombre de categoría y bucket SÍ se loguean: son configuración,
 * no dinero (mismo criterio que `backfill-catalogo-faltante.ts` y el
 * `logDecision` de `categorizar-transaccion`).
 */

/** Buckets asignables — excluye Ingreso (nunca se categoriza) y SinCategoria (no es destino de esInterna). */
const BUCKETS_ASIGNABLES: readonly Bucket[] = [
  Bucket.Necesidades,
  Bucket.Deseos,
  Bucket.Ahorro,
];

/** Nombre exacto de la categoría interna del sistema — ver docblock arriba (handle de uso único, no permanente). */
const NOMBRE_DESCONOCIDO = 'Desconocido';

/**
 * Cliente estructural mínimo requerido dentro de la transacción de
 * escritura (mirror angosto de BackfillDesconocidoTxClient) — solo el
 * método que se usa.
 */
export interface MarcarInternasTxClient {
  categoria: {
    updateMany(args: {
      where: { id: { in: string[] }; userId: string };
      data: { esInterna: true };
    }): Promise<{ count: number }>;
  };
}

export interface MarcarInternasClient {
  categoria: {
    findMany(args: {
      where: { userId: string; nombre: string };
      select: {
        id: true;
        nombre: true;
        esInterna: true;
        bucket: { select: { nombre: true } };
      };
    }): Promise<
      Array<{
        id: string;
        nombre: string;
        esInterna: boolean;
        bucket: { nombre: string };
      }>
    >;
  };
  $transaction<T>(fn: (tx: MarcarInternasTxClient) => Promise<T>): Promise<T>;
}

/** Candidata a marcar — fila por fila, para que el operador la verifique antes de aplicar. */
export interface CandidataAMarcar {
  readonly id: string;
  readonly bucket: Bucket;
  readonly nombre: string;
}

/** Un bucket asignable con más de una fila `Desconocido` — motivo de aborto. */
export interface BucketDuplicado {
  readonly bucket: Bucket;
  readonly candidatas: CandidataAMarcar[];
}

export interface MarcarInternasSummary {
  /** Filas que se van a marcar (o que se marcarían, en --dry-run) — id + bucket + nombre exactos. */
  readonly aMarcar: CandidataAMarcar[];
  /** Buckets cuya Desconocido ya estaba esInterna=true — no se tocan. */
  readonly yaMarcadas: readonly Bucket[];
  /** Buckets sin ninguna `Desconocido` — no falla; remediar con backfill-catalogo-faltante.ts. */
  readonly faltantes: readonly Bucket[];
}

export async function runMarcarCategoriasInternas(
  prisma: MarcarInternasClient,
  options: { userId: string; dryRun: boolean },
): Promise<MarcarInternasSummary> {
  const { userId, dryRun } = options;

  // Consulta explícita por nombre — el único handle disponible para esta
  // corrida única y supervisada (ver docblock). Trae TODAS las filas
  // `Desconocido` del usuario, en cualquier bucket, para poder distinguir
  // "no hay ninguna" de "hay una en un bucket no-asignable" (que este
  // script nunca toca).
  const filas = await prisma.categoria.findMany({
    where: { userId, nombre: NOMBRE_DESCONOCIDO },
    select: {
      id: true,
      nombre: true,
      esInterna: true,
      bucket: { select: { nombre: true } },
    },
  });

  const aMarcar: CandidataAMarcar[] = [];
  const yaMarcadas: Bucket[] = [];
  const faltantes: Bucket[] = [];
  const duplicados: BucketDuplicado[] = [];

  for (const bucket of BUCKETS_ASIGNABLES) {
    const candidatas = filas.filter(
      (fila) => (fila.bucket.nombre as Bucket) === bucket,
    );

    if (candidatas.length > 1) {
      duplicados.push({
        bucket,
        candidatas: candidatas.map((fila) => ({
          id: fila.id,
          bucket,
          nombre: fila.nombre,
        })),
      });
      continue;
    }

    if (candidatas.length === 0) {
      faltantes.push(bucket);
      continue;
    }

    const [candidata] = candidatas;
    if (candidata.esInterna) {
      yaMarcadas.push(bucket);
      continue;
    }

    aMarcar.push({ id: candidata.id, bucket, nombre: candidata.nombre });
  }

  // Aborta ANTES de escribir nada (ni siquiera en los buckets sin
  // ambigüedad) si algún bucket tiene más de una candidata — ver docblock.
  if (duplicados.length > 0) {
    const detalle = duplicados
      .map(
        ({ bucket, candidatas }) =>
          `${bucket}: ${candidatas.map((c) => `id=${c.id} nombre="${c.nombre}"`).join(', ')}`,
      )
      .join(' | ');
    throw new Error(
      `marcar-categorias-internas: el usuario ${userId} tiene más de una ` +
        `categoría "${NOMBRE_DESCONOCIDO}" en al menos un bucket asignable — ` +
        `abortando SIN escribir nada. Candidatas: ${detalle}. Revisá ` +
        'manualmente cuál fila es la correcta antes de reintentar.',
    );
  }

  if (dryRun || aMarcar.length === 0) {
    return { aMarcar, yaMarcadas, faltantes };
  }

  // Escritura: una sola transacción, WHERE filtrando por userId
  // (aislamiento multi-tenant, RNF-SEC-006).
  await prisma.$transaction(async (tx) => {
    await tx.categoria.updateMany({
      where: { id: { in: aMarcar.map((candidata) => candidata.id) }, userId },
      data: { esInterna: true },
    });
  });

  return { aMarcar, yaMarcadas, faltantes };
}

function printSummary(summary: MarcarInternasSummary, dryRun: boolean): void {
  console.log(
    `Marcar categorías internas (issue #778 CA-07)${dryRun ? ' (--dry-run, nada se escribió)' : ''}:`,
  );
  console.log('');
  console.log(
    `  A marcar (esInterna: false → true): ${summary.aMarcar.length}`,
  );
  for (const candidata of summary.aMarcar) {
    console.log(
      `    - id=${candidata.id} bucket=${candidata.bucket} nombre=${candidata.nombre}`,
    );
  }
  console.log('');
  console.log(
    `  Ya marcadas (esInterna ya en true, no se tocan): ${summary.yaMarcadas.length}`,
  );
  for (const bucket of summary.yaMarcadas) {
    console.log(`    - ${bucket}`);
  }
  console.log('');
  console.log(
    `  Faltantes (sin ninguna Desconocido — correr \`prisma/backfill-catalogo-faltante.ts --user <id>\`): ${summary.faltantes.length}`,
  );
  for (const bucket of summary.faltantes) {
    console.log(`    - ${bucket}`);
  }
}

/**
 * Wiring de script real: valida --user, gate de seguridad ANTES de
 * cualquier conexión a Prisma (ver assertDestructiveDbAllowed) + ejecución
 * de runMarcarCategoriasInternas. Exportado para poder testear sin BD (ver
 * marcar-categorias-internas.spec.ts).
 */
export async function main(
  argv: string[] = process.argv.slice(2),
): Promise<void> {
  const dryRun = argv.includes('--dry-run');

  const userIndex = argv.indexOf('--user');
  const userId = userIndex !== -1 ? argv[userIndex + 1] : undefined;
  if (!userId) {
    throw new Error(
      'marcar-categorias-internas requiere --user <id>. Sin default ni ' +
        '--all a propósito — ver el docblock de este archivo.',
    );
  }

  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'marcar-categorias-internas requiere DATABASE_URL o DIRECT_URL en el entorno.',
    );
  }
  // Mismo opt-in angosto que los backfills vecinos: el operador debe setear
  // AMBOS ALLOW_DESTRUCTIVE_DB=1 y CONFIRM_PROD_BACKFILL con el valor exacto
  // de abajo para poder correr esto una vez, supervisado, contra producción.
  assertDestructiveDbAllowed({
    connectionString,
    allowProductionAck: {
      envVar: 'CONFIRM_PROD_BACKFILL',
      expected: 'marcar-categorias-internas',
      operation:
        'marcar categorías internas Desconocido preexistentes (issue #778 CA-07)',
    },
  });

  const prisma = new PrismaClient({ adapter: new PrismaPg(connectionString) });
  try {
    const summary = await runMarcarCategoriasInternas(prisma, {
      userId,
      dryRun,
    });
    printSummary(summary, dryRun);
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecuta solo como script (tsx), no al importarse en tests.
if (require.main === module) {
  main()
    .then(() => {
      // El resumen de arriba ya dice si fue `--dry-run`, pero ESTA es la
      // línea que un operador skimea al final. "Completado" después de un
      // dry-run sugiere que algo se escribió, que es exactamente lo
      // contrario de lo que pasó — y en una herramienta destructiva ese
      // malentendido se paga caro.
      console.log(
        process.argv.includes('--dry-run')
          ? 'Dry-run completado — nada se escribió.'
          : 'Marcación completada.',
      );
    })
    .catch((error) => {
      console.error('Marcación falló:', error);
      process.exitCode = 1;
    });
}
