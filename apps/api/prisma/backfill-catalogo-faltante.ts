import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { assertDestructiveDbAllowed } from '../src/infrastructure/persistence/db-safety';
import {
  BUCKET_IDS,
  BUCKET_ID_TO_BUCKET,
} from '../src/infrastructure/persistence/bucket-ids';
import {
  CATEGORIA_TEMPLATE,
  PATRON_TEMPLATE,
  camposDeCategoriaPlantilla,
  claveCategoria,
} from '../src/infrastructure/persistence/catalogo-template';

/**
 * backfill-catalogo-faltante.ts.
 *
 * `copiarCatalogoTemplate` solo corre en el momento en que un catálogo se
 * MATERIALIZA (bootstrap, demo, Google signup-on-first-login) — un usuario
 * que ya existía cuando se agregó una entrada nueva a `CATEGORIA_TEMPLATE` /
 * `PATRON_TEMPLATE` nunca la recibe (ej. `Deuda` con sus dos patrones, y las
 * tres `Desconocido`, agregadas después de que hubiera usuarios en
 * producción). Este script rellena, para UN usuario, las entradas de la
 * plantilla que le falten hoy.
 *
 * `--user <id>` es OBLIGATORIO — a propósito NO hay default ni `--all`.
 * "Lo que falta según la plantilla" no puede distinguir "esta categoría
 * nunca se copió" de "el usuario la borró a propósito" (US-038 permite
 * borrar categorías propias) ni detectar un rename (el usuario renombró
 * `Deuda` a otra cosa y el diff la vería como faltante otra vez). Acotar a
 * un usuario explícito por corrida hace que el radio de impacto sea una
 * decisión consciente del operador, corrida por corrida — `--dry-run` es la
 * defensa para revisar la lista exacta antes de escribir.
 *
 * Clave de match de categorías: `(bucketId, nombre)`, igual que
 * `copiarCatalogoTemplate`/`backfill-icono-categoria.ts` — NUNCA `nombre`
 * solo (ADR-042 permite el mismo nombre en dos buckets distintos; ver las
 * tres `Desconocido`).
 *
 * Clave de match de patrones: el TEXTO (`patron`). `PatronClasificacion` no
 * tiene ningún `@@unique` (solo `@@index([userId])`) — a diferencia de
 * `Categoria`, acá `skipDuplicates` no existe como red de seguridad; la
 * idempotencia depende ENTERAMENTE del filtro en memoria contra lo que el
 * usuario ya tiene. Por eso, más abajo, `categoria.createMany` sí lleva
 * `skipDuplicates: true` (cinturón y tirantes sobre el `@@unique` real) pero
 * `patronClasificacion.createMany` no lleva ese flag — no hay unique al que
 * apuntarlo.
 *
 * Orden dentro de la transacción: categorías primero, después una RELECTURA
 * de `categoria.findMany` (para tener los ids REALES, incluidos los recién
 * creados — mismo patrón que `idPorClave` en `copiarCatalogoTemplate`), y
 * recién ahí los patrones — la FK compuesta `(categoriaId, userId) →
 * Categoria(id, userId)` exige que la categoría exista antes de que un
 * patrón pueda apuntarle.
 *
 * En `--dry-run` no se abre transacción ni se escribe nada. El paso de
 * "releer ids reales" no puede simularse en dry-run (esas categorías no se
 * crearon), así que el conteo de patrones faltantes se calcula SOLO por
 * texto — sin resolver ni fingir un `categoriaId` — y el summary lo deja
 * dicho explícitamente listando el texto del patrón, no un id inventado.
 *
 * No atómico frente a concurrencia: la lectura (paso 1/4) y la escritura
 * (dentro de la transacción) no son una única operación — si otro proceso
 * escribe sobre el mismo usuario entre medio, este script puede reinsertar
 * o pisar decisiones tomadas en esa ventana. Es un script SUPERVISADO,
 * pensado para una sola corrida manual por usuario, no para correr
 * concurrentemente ni en un loop.
 *
 * No requiere `ENCRYPTION_KEY`: nada de lo que este script escribe
 * (`Categoria.nombre/bucketId/icono`, `PatronClasificacion.*`) es una
 * columna cifrada (ADR-013 cubre `descripcion`, email y `numeroCuenta`) — a
 * propósito NO se copia el bloque de wiring de `AesGcmCryptoService` que
 * traen los backfills vecinos que sí tocan columnas cifradas
 * (`backfill-categorias.ts`, `backfill-descripcion-encryption.ts`).
 *
 * Estructurado como los backfills vecinos: `runBackfillCatalogo` es la
 * lógica pura (testeable con un fake client, sin BD — ver
 * backfill-catalogo-faltante.spec.ts), `main()` es el wiring de script real
 * (gate + PrismaClient) guardado tras `require.main === module`.
 */

/**
 * Fila de categoría a insertar — sin `id` (Prisma lo autogenera).
 *
 * #778: acá faltaba `esInterna`, y ESA es la razón de que la omisión en el
 * payload fuera invisible. El tipo describía el write de forma incompleta,
 * así que el compilador no tenía con qué quejarse: el script insertaba sin
 * la marca y las tres `Desconocido` caían en el default `false`. Un tipo
 * estructural de un write tiene que llevar TODOS los campos que la fila
 * necesita, justamente para que olvidarse de uno no compile.
 */
interface CategoriaFaltanteData {
  userId: string;
  nombre: string;
  bucketId: string;
  icono: string;
  esInterna: boolean;
}

/** Fila de patrón a insertar — `categoriaId` ya resuelto al id real. */
interface PatronFaltanteData {
  userId: string;
  patron: string;
  matchType: string;
  categoriaId: string;
  prioridad: number;
}

/**
 * Cliente estructural mínimo requerido por el backfill (mirror angosto de
 * BackfillIconoClient) — solo los métodos que se usan.
 */
export interface BackfillCatalogoTxClient {
  categoria: {
    createMany(args: {
      data: CategoriaFaltanteData[];
      skipDuplicates: boolean;
    }): Promise<{ count: number }>;
    findMany(args: {
      where: { userId: string };
      select: { id: true; nombre: true; bucketId: true };
    }): Promise<Array<{ id: string; nombre: string; bucketId: string }>>;
  };
  patronClasificacion: {
    createMany(args: {
      data: PatronFaltanteData[];
    }): Promise<{ count: number }>;
  };
}

export interface BackfillCatalogoClient {
  categoria: {
    findMany(args: {
      where: { userId: string };
      select: { id: true; nombre: true; bucketId: true };
    }): Promise<Array<{ id: string; nombre: string; bucketId: string }>>;
  };
  patronClasificacion: {
    findMany(args: {
      where: { userId: string };
      select: { patron: true };
    }): Promise<Array<{ patron: string }>>;
  };
  $transaction<T>(fn: (tx: BackfillCatalogoTxClient) => Promise<T>): Promise<T>;
}

export interface BackfillCatalogoSummary {
  /**
   * Categorías insertadas (o que se insertarían, en --dry-run), formateadas
   * `nombre (bucket)` — la clave compuesta como texto, para desambiguar las
   * tres `Desconocido` entre sí.
   */
  readonly categoriasInsertadas: string[];
  /** Texto de los patrones insertados (o que se insertarían). */
  readonly patronesInsertados: string[];
}

function formatCategoriaEntry(entrada: {
  nombre: string;
  bucket: string;
}): string {
  return `${entrada.nombre} (${entrada.bucket})`;
}

export async function runBackfillCatalogo(
  prisma: BackfillCatalogoClient,
  options: { userId: string; dryRun: boolean },
): Promise<BackfillCatalogoSummary> {
  const { userId, dryRun } = options;

  // 1. Categorías actuales del usuario.
  const categoriasExistentes = await prisma.categoria.findMany({
    where: { userId },
    select: { id: true, nombre: true, bucketId: true },
  });
  const paresExistentes = new Set(
    categoriasExistentes.map(
      (categoria) => `${categoria.bucketId}|${categoria.nombre}`,
    ),
  );

  // 2. Categorías faltantes: entradas de la plantilla cuyo par
  // (bucketId derivado, nombre) no está entre las leídas.
  const categoriasFaltantes = CATEGORIA_TEMPLATE.filter(
    (entrada) =>
      !paresExistentes.has(`${BUCKET_IDS[entrada.bucket]}|${entrada.nombre}`),
  );

  // 4. Patrones actuales del usuario.
  const patronesExistentes = await prisma.patronClasificacion.findMany({
    where: { userId },
    select: { patron: true },
  });
  const textosExistentes = new Set(
    patronesExistentes.map((patron) => patron.patron),
  );

  // 5. Patrones faltantes: por TEXTO — única clave de idempotencia
  // disponible (PatronClasificacion no tiene unique, ver docblock).
  const patronesFaltantes = PATRON_TEMPLATE.filter(
    (entrada) => !textosExistentes.has(entrada.patron),
  );

  if (dryRun) {
    // No escribe nada. El conteo de patrones se calcula solo por texto — sin
    // categoriaId, porque en dry-run ninguna categoría nueva existe todavía
    // (ver docblock).
    return {
      categoriasInsertadas: categoriasFaltantes.map(formatCategoriaEntry),
      patronesInsertados: patronesFaltantes.map((entrada) => entrada.patron),
    };
  }

  if (categoriasFaltantes.length === 0 && patronesFaltantes.length === 0) {
    return { categoriasInsertadas: [], patronesInsertados: [] };
  }

  // 6. Categorías y patrones se escriben dentro de UNA sola transacción.
  return prisma.$transaction(async (tx) => {
    if (categoriasFaltantes.length > 0) {
      await tx.categoria.createMany({
        // #778: acá faltaba `esInterna`, y no era cosmético — insertaba las
        // tres `Desconocido` sin marcar, así que este script NO alcanzaba
        // para desbloquear la ingesta y había que correr después
        // `marcar-categorias-internas.ts`. Ahora el mapeo plantilla → fila
        // vive en `camposDeCategoriaPlantilla`, que devuelve el objeto
        // COMPLETO: un consumidor que hace spread no puede olvidarse de un
        // campo (era la TERCERA copia del mismo mapeo, y la segunda que se
        // olvidaba de la marca).
        data: categoriasFaltantes.map((entrada) => ({
          userId,
          ...camposDeCategoriaPlantilla(entrada),
        })),
        // Cinturón y tirantes sobre @@unique([userId, bucketId, nombre]) —
        // el filtro de arriba ya debería garantizar 0 duplicados, esto es
        // defensa en profundidad, no la idempotencia real (que la da el
        // filtro por par). Ver docblock: PatronClasificacion no tiene este
        // cinturón porque no tiene ningún unique al que apuntarlo.
        skipDuplicates: true,
      });
    }

    // 3. Releer las categorías del usuario para tener los ids REALES
    // (incluidos los recién creados arriba) — mismo patrón que
    // copiarCatalogoTemplate's idPorClave.
    const categoriasActuales = await tx.categoria.findMany({
      where: { userId },
      select: { id: true, nombre: true, bucketId: true },
    });
    const idPorClave = new Map<string, string>(
      categoriasActuales.map((categoria) => {
        const bucket = BUCKET_ID_TO_BUCKET.get(categoria.bucketId)!;
        return [claveCategoria(bucket, categoria.nombre), categoria.id];
      }),
    );

    if (patronesFaltantes.length > 0) {
      await tx.patronClasificacion.createMany({
        data: patronesFaltantes.map((entrada) => ({
          userId,
          patron: entrada.patron,
          matchType: entrada.matchType,
          // entrada.categoria ya es la clave compuesta bucket:nombre
          // (CategoriaTemplateClave) — resuelve siempre, porque toda
          // categoría que un patrón de la plantilla referencia o ya existía
          // o se acaba de crear arriba, en la misma transacción.
          categoriaId: idPorClave.get(entrada.categoria)!,
          prioridad: entrada.prioridad,
        })),
      });
    }

    return {
      categoriasInsertadas: categoriasFaltantes.map(formatCategoriaEntry),
      patronesInsertados: patronesFaltantes.map((entrada) => entrada.patron),
    };
  });
}

function printSummary(summary: BackfillCatalogoSummary, dryRun: boolean): void {
  console.log(
    `Backfill de catálogo faltante${dryRun ? ' (--dry-run, nada se escribió)' : ''}:`,
  );
  console.log(
    `  Categorías insertadas: ${summary.categoriasInsertadas.length}`,
  );
  for (const nombre of summary.categoriasInsertadas) {
    console.log(`    - ${nombre}`);
  }
  console.log(`  Patrones insertados: ${summary.patronesInsertados.length}`);
  for (const patron of summary.patronesInsertados) {
    console.log(`    - ${patron}`);
  }
}

/**
 * Wiring de script real: valida --user, gate de seguridad ANTES de
 * cualquier conexión a Prisma (ver assertDestructiveDbAllowed) + ejecución
 * de runBackfillCatalogo. Exportado para poder testear sin BD (ver
 * backfill-catalogo-faltante.spec.ts).
 */
export async function main(
  argv: string[] = process.argv.slice(2),
): Promise<void> {
  const dryRun = argv.includes('--dry-run');

  const userIndex = argv.indexOf('--user');
  const userId = userIndex !== -1 ? argv[userIndex + 1] : undefined;
  if (!userId) {
    throw new Error(
      'backfill-catalogo-faltante requiere --user <id>. Sin default ni --all ' +
        'a propósito — ver el docblock de este archivo.',
    );
  }

  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'backfill-catalogo-faltante requiere DATABASE_URL o DIRECT_URL en el entorno.',
    );
  }
  // Mismo opt-in angosto que backfill-icono-categoria.ts / backfill-categorias.ts:
  // el operador debe setear AMBOS ALLOW_DESTRUCTIVE_DB=1 y CONFIRM_PROD_BACKFILL
  // con el valor exacto de abajo para poder correr esto una vez, supervisado,
  // contra producción.
  assertDestructiveDbAllowed({
    connectionString,
    allowProductionAck: {
      envVar: 'CONFIRM_PROD_BACKFILL',
      expected: 'catalogo-faltante',
      operation: 'backfill de catálogo faltante',
    },
  });

  const prisma = new PrismaClient({ adapter: new PrismaPg(connectionString) });
  try {
    const summary = await runBackfillCatalogo(prisma, { userId, dryRun });
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
          : 'Backfill completado.',
      );
    })
    .catch((error) => {
      console.error('Backfill falló:', error);
      process.exitCode = 1;
    });
}
