import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { assertDestructiveDbAllowed } from '../src/infrastructure/persistence/db-safety';
import { BUCKET_IDS } from '../src/infrastructure/persistence/bucket-ids';
import { CATEGORIA_TEMPLATE } from '../src/infrastructure/persistence/catalogo-template';

/**
 * backfill-icono-categoria.ts (ADR-045).
 *
 * ADR-045 decidió explícitamente "sin backfill de filas existentes" para el
 * default seed de `Categoria.icono` — el default solo se copia en el momento
 * en que un catálogo se MATERIALIZA (bootstrap, demo, Google
 * signup-on-first-login), nunca sobre una fila que ya existía. Este script es
 * ESE backfill: corre a mano, una vez, para rellenar `icono` en las filas que
 * quedaron `NULL` porque su catálogo se materializó ANTES de ADR-045.
 *
 * Clave de match: `(nombre, bucketId)`, NUNCA `nombre` solo.
 * ADR-042 permite que un mismo usuario tenga dos categorías con el mismo
 * `nombre` en buckets distintos (`@@unique([userId, bucketId, nombre])`).
 * Matchear solo por `nombre` le estamparía el ícono de la plantilla a una
 * categoría homónima de OTRO bucket que nunca perteneció a esa entrada de la
 * plantilla. `bucketId` se deriva SIEMPRE con `BUCKET_IDS[entrada.bucket]` en
 * el write site — nunca un literal (ADR-037 D-02, mismo patrón que
 * `copiarCatalogoTemplate`).
 *
 * `icono: null` va en el WHERE, siempre. Nunca pisa una elección explícita
 * del usuario — es la misma postura que el seed ("setea `icono` solo en
 * `create`, nunca en `update`", ADR-045 D-09). Como consecuencia, este script
 * es idempotente: una segunda corrida encuentra 0 filas en `icono: null` y
 * actualiza 0.
 *
 * Scope: GLOBAL, sin `userId` — a propósito, a diferencia de
 * `backfill-categorias.ts` (hard-pinned a `USER_ID_FIJO`, ver su docblock).
 * Ese script resuelve identidad de categoría y mueve la clasificación de
 * transacciones leyendo el catálogo de UN usuario — un scope global ahí
 * sería corrupción cross-tenant, el inverso exacto de RNF-SEC-006. Este
 * script, en cambio, solo escribe una constante de código (el `icono` de
 * `CATEGORIA_TEMPLATE`) sobre la fila propia de CADA usuario que matchee
 * `(nombre, bucketId, icono: null)` — no lee ni cruza datos de otro usuario,
 * no mueve plata ni cambia clasificación, y `icono` es puramente de
 * presentación. Por eso un scope global es seguro acá y sería peligroso allá.
 *
 * No requiere `ENCRYPTION_KEY`: `icono` no es una columna cifrada (ADR-013
 * cubre `descripcion`, email y `numeroCuenta`) — a propósito NO se copia el
 * bloque de wiring de `AesGcmCryptoService` que traen los backfills vecinos
 * que sí tocan columnas cifradas (`backfill-categorias.ts`,
 * `backfill-descripcion-encryption.ts`).
 *
 * Estructurado como los backfills vecinos: `runBackfillIcono` es la lógica
 * pura (testeable con un fake client, sin BD — ver
 * backfill-icono-categoria.spec.ts), `main()` es el wiring de script real
 * (gate + PrismaClient) guardado tras `require.main === module`.
 */

/** Cliente mínimo requerido por el backfill (mirror angosto de BackfillClient). */
export interface BackfillIconoClient {
  categoria: {
    count(args: {
      where: { nombre: string; bucketId: string; icono: null };
    }): Promise<number>;
    updateMany(args: {
      where: { nombre: string; bucketId: string; icono: null };
      data: { icono: string };
    }): Promise<{ count: number }>;
  };
  $transaction<T>(operaciones: Promise<T>[]): Promise<T[]>;
}

export interface BackfillIconoSummary {
  /** Total de filas efectivamente actualizadas (o que se actualizarían, en --dry-run). */
  readonly totalActualizadas: number;
  /**
   * Conteo por entrada de plantilla. La clave desambigua el bucket
   * (`` `${nombre} (${bucket})` ``) porque ADR-042 admite nombres repetidos
   * entre buckets distintos.
   */
  readonly porCategoria: Record<string, number>;
}

export async function runBackfillIcono(
  prisma: BackfillIconoClient,
  options: { dryRun: boolean },
): Promise<BackfillIconoSummary> {
  const porCategoria: Record<string, number> = {};
  let totalActualizadas = 0;

  if (options.dryRun) {
    // --dry-run: no escribe nada, pero reporta cuántas filas SE actualizarían
    // usando count() con el mismo WHERE que usaría el updateMany real.
    for (const entrada of CATEGORIA_TEMPLATE) {
      const where: { nombre: string; bucketId: string; icono: null } = {
        nombre: entrada.nombre,
        bucketId: BUCKET_IDS[entrada.bucket],
        icono: null,
      };
      const count = await prisma.categoria.count({ where });
      const key = `${entrada.nombre} (${entrada.bucket})`;
      porCategoria[key] = count;
      totalActualizadas += count;
    }
    return { totalActualizadas, porCategoria };
  }

  // Corrida real: una operación updateMany por entrada de plantilla, todas
  // dentro de UNA sola transacción.
  const operaciones = CATEGORIA_TEMPLATE.map((entrada) =>
    prisma.categoria.updateMany({
      where: {
        nombre: entrada.nombre,
        bucketId: BUCKET_IDS[entrada.bucket],
        icono: null,
      },
      data: { icono: entrada.icono },
    }),
  );

  const resultados = await prisma.$transaction(operaciones);

  resultados.forEach((resultado, index) => {
    const entrada = CATEGORIA_TEMPLATE[index];
    const key = `${entrada.nombre} (${entrada.bucket})`;
    porCategoria[key] = resultado.count;
    totalActualizadas += resultado.count;
  });

  return { totalActualizadas, porCategoria };
}

function printSummary(summary: BackfillIconoSummary, dryRun: boolean): void {
  console.log(
    `Backfill de icono de categoría${dryRun ? ' (--dry-run, nada se escribió)' : ''}:`,
  );
  console.log(`  Filas actualizadas: ${summary.totalActualizadas}`);
  console.log('  Por categoría:', summary.porCategoria);
}

/**
 * Wiring de script real: gate de seguridad ANTES de cualquier conexión a
 * Prisma (ver assertDestructiveDbAllowed) + ejecución de runBackfillIcono.
 * Exportado para poder testear el gate sin BD (ver
 * backfill-icono-categoria.spec.ts).
 */
export async function main(
  argv: string[] = process.argv.slice(2),
): Promise<void> {
  const dryRun = argv.includes('--dry-run');

  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'backfill-icono-categoria requiere DATABASE_URL o DIRECT_URL en el entorno.',
    );
  }
  // Mismo opt-in angosto que backfill-categorias.ts: el operador debe setear
  // AMBOS ALLOW_DESTRUCTIVE_DB=1 y CONFIRM_PROD_BACKFILL con el valor exacto
  // de abajo para poder correr esto una vez, supervisado, contra producción.
  assertDestructiveDbAllowed({
    connectionString,
    allowProductionAck: {
      envVar: 'CONFIRM_PROD_BACKFILL',
      expected: 'adr-045-icono-categoria',
      operation: 'ADR-045 categoria icono defaults backfill',
    },
  });

  const prisma = new PrismaClient({ adapter: new PrismaPg(connectionString) });
  try {
    const summary = await runBackfillIcono(prisma, { dryRun });
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
