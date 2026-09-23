import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { assertDestructiveDbAllowed } from '../src/infrastructure/persistence/db-safety';
import {
  BUCKET_IDS,
  BUCKET_ID_TO_BUCKET,
} from '../src/infrastructure/persistence/bucket-ids';
import { Bucket } from '../src/domain/value-objects/bucket';
import { seleccionarCategoriaInterna } from '../src/application/services/categoria-por-defecto';

/**
 * backfill-desconocido.ts (issue #778, tramo 4).
 *
 * Los tramos 1-3 cerraron TODO camino vivo que producía el estado viejo
 * (ingesta ahora clasifica lo no-match como `Gustos · Desconocido`, no como
 * `SinCategoria`; borrar una categoría reasigna a la `Desconocido` del mismo
 * bucket). Con ningún camino vivo produciendo ya ese estado, este script
 * migra lo que quedó grabado ANTES del cambio.
 *
 * Decisión de producto (registrada en #778): la plata histórica de
 * `SinCategoria` se mueve a `Gustos · Desconocido`. El bucket `SinCategoria`
 * en sí NO se borra acá (eso es el tramo 5). Consecuencia ACEPTADA
 * explícitamente: meses ya cerrados cambian de veredicto (su total de
 * Gustos/Deseos sube). Por eso el resumen reporta el impacto POR PERÍODO
 * ANTES de escribir — el operador tiene que poder ver qué meses cambian
 * antes de correr esto de verdad, no descubrirlo después.
 *
 * ── Las DOS migraciones ──────────────────────────────────────────────────
 *
 * (A) `bucketId = SinCategoria` → `bucketId = Deseos` + `categoriaId =
 *     Desconocido de Deseos`. MUEVE PLATA ENTRE BUCKETS — es la que cambia
 *     veredictos. El destino es SIEMPRE Deseos, nunca el bucket de la fila
 *     (SinCategoria no tiene "un" bucket de origen que preservar: es
 *     justamente la ausencia de bucket real, ahora materializada en la
 *     `Desconocido` de Deseos por la misma razón de diseño que
 *     `BUCKET_POR_DEFECTO` — ver `categoria-por-defecto.ts`).
 *
 * (B) `bucketId ∈ {Necesidades, Deseos, Ahorro}` AND `categoriaId IS NULL`
 *     → `categoriaId = Desconocido de ESE bucket`. `bucketId` NUNCA se toca
 *     — no mueve plata, solo rellena una categoría que faltaba en una fila
 *     que YA estaba bucketeada correctamente (p. ej. por
 *     `backfill-categorias.ts` u otro camino legacy que asignó bucket sin
 *     categoría). Usa `seleccionarCategoriaInterna` (DRY con
 *     `eliminar-categoria.use-case.ts`, única fuente de verdad de "cuál es
 *     la Desconocido de un bucket dado").
 *
 * ── Lo que NUNCA se toca ─────────────────────────────────────────────────
 *
 * `bucketId IS NULL` — el fallo de infraestructura NO es SinCategoria.
 * `process-ingesta.use-case.ts` (paso 4, ver su docblock) deja una fila en
 * `null` cuando el catálogo estaba caído al momento de ingestar: es
 * categorización PENDIENTE de reintento, no una clasificación definitiva.
 * Migrarla la convertiría en una clasificación permanente y falsa. Este
 * script la CUENTA y la reporta aparte — nunca la escribe.
 *
 * ⚠️ Trampa de lectura: `resolverBucket(bucketId)` en `bucket-ids.ts`
 * foldea `null → SinCategoria` para AGREGACIÓN de reportes de lectura. Ese
 * fold NO se usa acá — el filtro de qué migrar es SIEMPRE por `bucketId`
 * crudo (columna real), nunca por el resultado de `resolverBucket`.
 *
 * `bucket = Ingreso` — nunca se categoriza por diseño
 * (`registrar-movimiento-manual.use-case.ts` fija `categoriaId = null` sin
 * llamar al clasificador). Ninguna de las dos migraciones lo alcanza: (A)
 * filtra por `bucketId = SinCategoria` (nunca Ingreso) y (B) filtra por
 * `bucketId ∈ {Necesidades, Deseos, Ahorro}` (tampoco Ingreso) — el
 * invariante se sostiene por construcción del WHERE, sin un exclude
 * explícito.
 *
 * ── Precondición: abortar, no migrar a medias ────────────────────────────
 *
 * Antes de leer o escribir una sola `Transaccion`, el script verifica que
 * el usuario tenga las TRES `Desconocido` (una por bucket asignable). Si
 * falta alguna, aborta con un error (ni `--dry-run` continúa) indicando
 * cuál falta y cómo remediarlo (`backfill-catalogo-faltante.ts --user
 * <id>`). Migrar solo las categorías que SÍ resuelven dejaría un backfill a
 * medias, exactamente lo que este gate previene.
 *
 * ── Aislamiento multi-tenant (RNF-SEC-006) ───────────────────────────────
 *
 * Todo WHERE sobre `Transaccion` filtra por `account: { userId }` en SQL —
 * nunca en memoria. `--user <id>` es OBLIGATORIO, sin default ni `--all`
 * (mismo razonamiento que #740/`backfill-catalogo-faltante.ts`: un backfill
 * no puede distinguir "nunca la tuvo" de "la borró a propósito", así que
 * cada corrida es una decisión consciente del operador).
 *
 * ── Estructura ────────────────────────────────────────────────────────────
 *
 * `runBackfillDesconocido` es la lógica pura (testeable con un fake client,
 * sin BD — ver `backfill-desconocido.spec.ts`); `main()` es el wiring de
 * script real (gate + PrismaClient), guardado tras `require.main ===
 * module`. `--dry-run` no abre transacción ni escribe nada — el precheck de
 * las tres `Desconocido` y el cómputo del resumen (incluido el impacto por
 * período) corren igual, para que el operador pueda revisar antes de
 * escribir de verdad.
 *
 * No se loguea descripción ni monto por fila (ADR-013) — los totales
 * agregados por período en el resumen son del propio operador sobre su
 * propio usuario, y son justamente el punto de este resumen.
 */

/** Buckets asignables — excluye Ingreso (nunca se categoriza) y SinCategoria (no es un destino, es el origen de (A)). */
const BUCKETS_ASIGNABLES: readonly Bucket[] = [
  Bucket.Necesidades,
  Bucket.Deseos,
  Bucket.Ahorro,
];

/** "YYYY-MM" para una fecha UTC — mismo formato que PeriodoMes.valor (ver prisma-resumen-anual.repository.ts). */
function mesLabel(fecha: Date): string {
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Fila de categoría, proyectada al mínimo que necesita `seleccionarCategoriaInterna`. */
interface CategoriaRow {
  id: string;
  nombre: string;
  esInterna: boolean;
  bucket: { nombre: string };
}

/** Fila de transacción candidata a alguna de las dos migraciones. */
interface TransaccionRow {
  id: string;
  fecha: Date;
  cargo: bigint;
  abono: bigint;
  bucketId: string | null;
}

/**
 * Cliente estructural mínimo requerido dentro de la transacción de escritura
 * (mirror angosto de BackfillCatalogoTxClient) — solo los métodos que se
 * usan.
 */
export interface BackfillDesconocidoTxClient {
  transaccion: {
    updateMany(args: {
      where: { id: { in: string[] } };
      data: { categoriaId: string; bucketId?: string };
    }): Promise<{ count: number }>;
  };
}

export interface BackfillDesconocidoClient {
  categoria: {
    findMany(args: {
      where: { userId: string };
      select: {
        id: true;
        nombre: true;
        esInterna: true;
        bucket: { select: { nombre: true } };
      };
    }): Promise<CategoriaRow[]>;
  };
  transaccion: {
    findMany(args: {
      where: {
        bucketId: string | { in: string[] };
        categoriaId?: null;
        account: { userId: string };
      };
      select: {
        id: true;
        fecha: true;
        cargo: true;
        abono: true;
        bucketId: true;
      };
    }): Promise<TransaccionRow[]>;
    count(args: {
      where: { bucketId: null; account: { userId: string } };
    }): Promise<number>;
  };
  $transaction<T>(
    fn: (tx: BackfillDesconocidoTxClient) => Promise<T>,
  ): Promise<T>;
}

/** Impacto de la migración (A) para UN período — el dato que expone qué meses cambian de veredicto. */
export interface ImpactoPeriodo {
  readonly periodo: string; // "YYYY-MM"
  /**
   * Suma de `cargo` de las filas de ese período que se mueven a Gustos. Se
   * usa `cargo` (no `cargo - abono`) porque toda fila en scope de (A) es un
   * gasto por construcción (Ingreso jamás llega a `bucketId = SinCategoria`,
   * ver docblock del archivo) — es exactamente el monto que se suma al
   * `totalCargo` de Deseos para ese mes (ver `prisma-resumen-mes.repository.ts`).
   */
  readonly montoMovido: bigint;
}

export interface BackfillDesconocidoSummary {
  readonly migracionSinCategoria: {
    /** Filas SinCategoria → Deseos/Desconocido (o que se moverían, en --dry-run). */
    readonly filasMigradas: number;
    /** Impacto por período, orden ascendente — ver ImpactoPeriodo. */
    readonly impactoPorPeriodo: ImpactoPeriodo[];
  };
  readonly migracionCategoriaNula: {
    /** Filas con categoriaId completado (bucket intacto), o que se completarían en --dry-run. */
    readonly filasMigradas: number;
  };
  /** bucketId IS NULL — NUNCA migradas, solo contadas (ver docblock). */
  readonly pendientesBucketNulo: number;
}

export async function runBackfillDesconocido(
  prisma: BackfillDesconocidoClient,
  options: { userId: string; dryRun: boolean },
): Promise<BackfillDesconocidoSummary> {
  const { userId, dryRun } = options;

  // 1. Precondición: las tres Desconocido tienen que existir ANTES de leer o
  // escribir una sola Transaccion — abortar acá, no a mitad de camino.
  const categoriaRows = await prisma.categoria.findMany({
    where: { userId },
    select: {
      id: true,
      nombre: true,
      esInterna: true,
      bucket: { select: { nombre: true } },
    },
  });
  const catalogo = categoriaRows.map((row) => ({
    id: row.id,
    nombre: row.nombre,
    esInterna: row.esInterna,
    bucket: row.bucket.nombre as Bucket,
  }));

  const desconocidoPorBucket = new Map<Bucket, { id: string }>();
  const faltantes: Bucket[] = [];
  for (const bucket of BUCKETS_ASIGNABLES) {
    const encontrada = seleccionarCategoriaInterna(catalogo, bucket);
    if (encontrada === null) {
      faltantes.push(bucket);
    } else {
      desconocidoPorBucket.set(bucket, encontrada);
    }
  }
  if (faltantes.length > 0) {
    throw new Error(
      `backfill-desconocido: al usuario ${userId} le falta la categoría ` +
        `Desconocido en ${faltantes.join(', ')}. Este backfill NUNCA migra a ` +
        'medias — corré primero `prisma/backfill-catalogo-faltante.ts --user ' +
        '<id>` para completar el catálogo y volvé a intentar.',
    );
  }

  // 2. Migración (A): SinCategoria → Deseos/Desconocido. MUEVE PLATA ENTRE
  // BUCKETS (ver docblock del archivo). Filtro por bucketId CRUDO — nunca
  // por resolverBucket() (esa función foldea null → SinCategoria para
  // agregación de reportes, no para decidir qué migrar).
  const filasSinCategoria = await prisma.transaccion.findMany({
    where: {
      bucketId: BUCKET_IDS[Bucket.SinCategoria],
      account: { userId },
    },
    select: { id: true, fecha: true, cargo: true, abono: true, bucketId: true },
  });

  const impactoPorPeriodoMap = new Map<string, bigint>();
  for (const fila of filasSinCategoria) {
    const periodo = mesLabel(fila.fecha);
    impactoPorPeriodoMap.set(
      periodo,
      (impactoPorPeriodoMap.get(periodo) ?? 0n) + fila.cargo,
    );
  }
  const impactoPorPeriodo: ImpactoPeriodo[] = [
    ...impactoPorPeriodoMap.entries(),
  ]
    .sort(([periodoA], [periodoB]) => periodoA.localeCompare(periodoB))
    .map(([periodo, montoMovido]) => ({ periodo, montoMovido }));

  // 3. Migración (B): categoriaId IS NULL en un bucket YA asignado.
  // bucketId nunca se toca — no mueve plata.
  const bucketIdsAsignables = BUCKETS_ASIGNABLES.map(
    (bucket) => BUCKET_IDS[bucket],
  );
  const filasCategoriaNula = await prisma.transaccion.findMany({
    where: {
      bucketId: { in: bucketIdsAsignables },
      categoriaId: null,
      account: { userId },
    },
    select: { id: true, fecha: true, cargo: true, abono: true, bucketId: true },
  });

  // 4. bucketId IS NULL — categorización pendiente de reintento, NUNCA
  // SinCategoria (ver docblock del archivo). Solo se cuenta.
  const pendientesBucketNulo = await prisma.transaccion.count({
    where: { bucketId: null, account: { userId } },
  });

  const summary: BackfillDesconocidoSummary = {
    migracionSinCategoria: {
      filasMigradas: filasSinCategoria.length,
      impactoPorPeriodo,
    },
    migracionCategoriaNula: {
      filasMigradas: filasCategoriaNula.length,
    },
    pendientesBucketNulo,
  };

  if (dryRun) {
    // No escribe nada — el resumen ya quedó calculado arriba (mismo dato
    // que escribiría la corrida real).
    return summary;
  }

  if (filasSinCategoria.length === 0 && filasCategoriaNula.length === 0) {
    return summary;
  }

  // 5. Escritura: ambas migraciones dentro de UNA sola transacción.
  await prisma.$transaction(async (tx) => {
    if (filasSinCategoria.length > 0) {
      const desconocidoDeseos = desconocidoPorBucket.get(Bucket.Deseos)!;
      await tx.transaccion.updateMany({
        where: { id: { in: filasSinCategoria.map((fila) => fila.id) } },
        data: {
          bucketId: BUCKET_IDS[Bucket.Deseos],
          categoriaId: desconocidoDeseos.id,
        },
      });
    }

    if (filasCategoriaNula.length > 0) {
      // Agrupar por bucketId — cada bucket resuelve a una Desconocido
      // distinta, y el bucket de cada fila NUNCA se toca acá.
      const idsPorBucketId = new Map<string, string[]>();
      for (const fila of filasCategoriaNula) {
        // El WHERE de arriba ya garantiza bucketId no-null (uno de los 3
        // asignables) — el `!` refleja esa invariante, no una suposición.
        const bucketId = fila.bucketId!;
        const ids = idsPorBucketId.get(bucketId) ?? [];
        ids.push(fila.id);
        idsPorBucketId.set(bucketId, ids);
      }

      for (const [bucketId, ids] of idsPorBucketId) {
        const bucket = BUCKET_ID_TO_BUCKET.get(bucketId)!;
        const desconocido = desconocidoPorBucket.get(bucket)!;
        await tx.transaccion.updateMany({
          where: { id: { in: ids } },
          data: { categoriaId: desconocido.id },
        });
      }
    }
  });

  return summary;
}

function formatCLP(monto: bigint): string {
  return monto.toLocaleString('es-CL');
}

function printSummary(
  summary: BackfillDesconocidoSummary,
  dryRun: boolean,
): void {
  console.log(
    `Backfill de Desconocido (issue #778 tramo 4)${dryRun ? ' (--dry-run, nada se escribió)' : ''}:`,
  );
  console.log('');
  console.log(
    '  (A) SinCategoria → Gustos · Desconocido — MUEVE PLATA ENTRE BUCKETS, cambia veredictos de meses ya cerrados:',
  );
  console.log(
    `      Filas migradas: ${summary.migracionSinCategoria.filasMigradas}`,
  );
  if (summary.migracionSinCategoria.impactoPorPeriodo.length > 0) {
    console.log('      Impacto por período (monto que se suma a Gustos):');
    for (const { periodo, montoMovido } of summary.migracionSinCategoria
      .impactoPorPeriodo) {
      console.log(`        ${periodo}: $${formatCLP(montoMovido)}`);
    }
  }
  console.log('');
  console.log(
    '  (B) categoriaId nulo en bucket ya asignado → Desconocido del MISMO bucket (bucketId intacto, no mueve plata):',
  );
  console.log(
    `      Filas migradas: ${summary.migracionCategoriaNula.filasMigradas}`,
  );
  console.log('');
  console.log(
    '  Pendientes (bucketId IS NULL) — categorización fallida en espera de reintento, NO son SinCategoria y NO se migran:',
  );
  console.log(`      Filas: ${summary.pendientesBucketNulo}`);
}

/**
 * Wiring de script real: valida --user, gate de seguridad ANTES de
 * cualquier conexión a Prisma (ver assertDestructiveDbAllowed) + ejecución
 * de runBackfillDesconocido. Exportado para poder testear sin BD (ver
 * backfill-desconocido.spec.ts).
 */
export async function main(
  argv: string[] = process.argv.slice(2),
): Promise<void> {
  const dryRun = argv.includes('--dry-run');

  const userIndex = argv.indexOf('--user');
  const userId = userIndex !== -1 ? argv[userIndex + 1] : undefined;
  if (!userId) {
    throw new Error(
      'backfill-desconocido requiere --user <id>. Sin default ni --all a ' +
        'propósito — ver el docblock de este archivo.',
    );
  }

  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'backfill-desconocido requiere DATABASE_URL o DIRECT_URL en el entorno.',
    );
  }
  // Mismo opt-in angosto que backfill-catalogo-faltante.ts: el operador debe
  // setear AMBOS ALLOW_DESTRUCTIVE_DB=1 y CONFIRM_PROD_BACKFILL con el valor
  // exacto de abajo para poder correr esto una vez, supervisado, contra
  // producción.
  assertDestructiveDbAllowed({
    connectionString,
    allowProductionAck: {
      envVar: 'CONFIRM_PROD_BACKFILL',
      expected: 'desconocido',
      operation: 'backfill de Desconocido (issue #778 tramo 4)',
    },
  });

  const prisma = new PrismaClient({ adapter: new PrismaPg(connectionString) });
  try {
    const summary = await runBackfillDesconocido(prisma, { userId, dryRun });
    printSummary(summary, dryRun);
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecuta solo como script (tsx), no al importarse en tests.
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
