import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { assertDestructiveDbAllowed } from '../src/infrastructure/persistence/db-safety';
import {
  AesGcmCryptoService,
  tieneFormatoV1,
} from '../src/infrastructure/persistence/aes-gcm-crypto.service';
import { isValid32ByteBase64Key } from '../src/config/env';
import type { ICryptoService } from '../src/application/ports/crypto-service.port';

/**
 * backfill-descripcion-encryption.ts (ADR-013 follow-up).
 *
 * Backfill de UNA vez, supervisado e idempotente: cifra las filas
 * `Transaccion.descripcion` EXISTENTES que todavía están en texto plano,
 * ahora que `AesGcmCryptoService` es el `ICryptoService` de producción (ver
 * aes-gcm-crypto.service.ts) — sin este backfill, las filas escritas ANTES
 * de ese cambio quedan en texto plano para siempre (decrypt() las deja pasar
 * sin tocar, por diseño, para permitir la migración sin downtime).
 *
 * Clasificación por fila (ver `partitionBatch`), tres salidas — NO solo
 * "cifrada / no cifrada":
 *  1. Ciphertext v1 VÁLIDO (prefijo `v1:` + estructura de 4 segmentos que
 *     `tieneFormatoV1()` — mismo predicado que usa
 *     `AesGcmCryptoService.decrypt()` — reconoce como parseable) → SALTAR,
 *     nunca se re-cifra. Esto es lo que hace idempotente al script: correrlo
 *     más de una vez es siempre seguro.
 *  2. Texto plano sin prefijo `v1:` → CIFRAR.
 *  3. "Sospechosa": empieza con `v1:` pero NO tiene la estructura de 4
 *     segmentos (p. ej. texto plano legacy que por coincidencia arranca con
 *     "v1:"). Cifrarla sería inseguro si en realidad fuera un ciphertext
 *     real corrupto (doble cifrado), y saltarla en silencio la dejaría sin
 *     cifrar para siempre Y rompería en tiempo de lectura (decrypt() la
 *     rechaza — ver aes-gcm-crypto.service.ts). No se cifra NI se cuenta
 *     como ya-cifrada: se reporta aparte (`totalSospechosas`) y se loguea su
 *     id (nunca la descripcion) para revisión humana en una corrida
 *     supervisada.
 *
 * Estructurado igual que backfill-categorias.ts: `runBackfillDescripcionEncryption`
 * es la lógica pura (testeable con un fake client — ver
 * backfill-descripcion-encryption.spec.ts), `main()` es el wiring de script
 * real (gate + PrismaClient + crypto real), guardado tras
 * `require.main === module`.
 */

/** Cliente mínimo requerido por el backfill (mirror de BackfillClient en backfill-categorias.ts). */
export interface DescripcionBackfillClient {
  transaccion: {
    findMany(args: {
      where?: { id: { gt: string } };
      orderBy: { id: 'asc' };
      take: number;
      select: { id: true; descripcion: true };
    }): Promise<Array<{ id: string; descripcion: string }>>;
    update(args: {
      where: { id: string };
      data: { descripcion: string };
    }): Promise<{ id: string }>;
  };
  $transaction<T>(
    operaciones: Promise<T>[],
    options?: { timeout?: number; maxWait?: number },
  ): Promise<T[]>;
}

export interface DescripcionBackfillSummary {
  /** Total de filas escaneadas (todas las Transaccion, sin filtrar por estado de cifrado). */
  readonly totalScanned: number;
  /** Filas cuya descripcion se cifró en esta corrida. */
  readonly totalEncrypted: number;
  /** Filas que YA tenían un ciphertext v1 VÁLIDO y se saltaron. */
  readonly totalSkippedYaCifradas: number;
  /**
   * Filas con prefijo `v1:` que NO parsean como ciphertext v1 válido — ni se
   * cifran (podría ser un ciphertext real corrupto; cifrarlo sería
   * doble-cifrado) ni se cuentan como ya-cifradas. Requieren revisión
   * humana — ver el WARNING logueado con sus ids.
   */
  readonly totalSospechosas: number;
}

const VERSION_PREFIX = 'v1:';

type ClasificacionFila = 'plaintext' | 'ciphertext' | 'sospechosa';

/**
 * Clasifica UNA descripcion en tres categorías (ver docstring del módulo):
 * plaintext (cifrar), ciphertext v1 válido (saltar) o sospechosa (ni una
 * cosa ni la otra — prefijo `v1:` pero estructura inválida).
 */
function clasificarFila(descripcion: string): ClasificacionFila {
  if (!descripcion.startsWith(VERSION_PREFIX)) {
    return 'plaintext';
  }
  return tieneFormatoV1(descripcion) ? 'ciphertext' : 'sospechosa';
}

/**
 * Decide, para UN batch ya leído de la BD, qué filas cifrar, cuáles saltar y
 * cuáles son sospechosas (ver clasificarFila). Lógica pura (sin I/O) —
 * separada de `runBackfillDescripcionEncryption` para poder testearla
 * directo, sin un fake de Prisma completo.
 */
export function partitionBatch(
  rows: ReadonlyArray<{ id: string; descripcion: string }>,
  crypto: ICryptoService,
): {
  toUpdate: ReadonlyArray<{ id: string; descripcionCifrada: string }>;
  skipped: number;
  /** Solo ids — NUNCA la descripcion (ver política de logueo del módulo). */
  sospechosas: ReadonlyArray<string>;
} {
  const toUpdate: Array<{ id: string; descripcionCifrada: string }> = [];
  const sospechosas: string[] = [];
  let skipped = 0;

  for (const row of rows) {
    const clasificacion = clasificarFila(row.descripcion);

    if (clasificacion === 'ciphertext') {
      skipped++;
      continue;
    }
    if (clasificacion === 'sospechosa') {
      sospechosas.push(row.id);
      continue;
    }

    toUpdate.push({
      id: row.id,
      descripcionCifrada: crypto.encrypt(row.descripcion),
    });
  }

  return { toUpdate, skipped, sospechosas };
}

/**
 * Tamaño de batch por defecto. Cada batch envuelve sus updates en UN
 * `$transaction`, y cada update es un round-trip de red. Contra prod
 * (Supabase, ~60ms por update medidos) un batch de 500 tardó 30.4s y superó
 * el `TRANSACTION_TIMEOUT_MS` de 30s → la transacción expiró y abortó. 100
 * updates ≈ 6s, con margen holgado para picos de latencia. Se puede sobreescribir
 * con `--batch-size=N` (ver parseBatchSizeArg) si un entorno necesita otro valor.
 */
const DEFAULT_BATCH_SIZE = 100;
/**
 * Timeout explícito del `$transaction` por batch — el default de Prisma
 * (5s) es riesgoso para un batch de `DEFAULT_BATCH_SIZE` updates
 * individuales sobre el pooler de Supabase (latencia de red variable).
 */
const TRANSACTION_TIMEOUT_MS = 30_000;
const TRANSACTION_MAX_WAIT_MS = 10_000;

/**
 * Recorre `Transaccion` en batches (paginación por cursor `id`, ascendente —
 * evita el costo de `skip` en Postgres para tablas grandes). Por batch: cifra
 * las filas en texto plano y las persiste con `update()` individual dentro de
 * un `$transaction` (cada fila produce un ciphertext distinto — IV
 * aleatorio — así que a diferencia de backfill-categorias.ts no se puede
 * agrupar en un solo `updateMany`).
 *
 * Nunca loguea `descripcion` en texto plano ni la clave — solo conteos y,
 * para las filas sospechosas, sus ids (ver printSummary y el WARNING más
 * abajo).
 */
export async function runBackfillDescripcionEncryption(
  prisma: DescripcionBackfillClient,
  crypto: ICryptoService,
  options: { dryRun: boolean; batchSize?: number } = { dryRun: false },
): Promise<DescripcionBackfillSummary> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;

  let cursor: string | undefined;
  let totalScanned = 0;
  let totalEncrypted = 0;
  let totalSkippedYaCifradas = 0;
  const idsSospechosas: string[] = [];

  for (;;) {
    const rows = await prisma.transaccion.findMany({
      ...(cursor ? { where: { id: { gt: cursor } } } : {}),
      orderBy: { id: 'asc' },
      take: batchSize,
      select: { id: true, descripcion: true },
    });

    if (rows.length === 0) break;

    totalScanned += rows.length;
    const { toUpdate, skipped, sospechosas } = partitionBatch(rows, crypto);
    totalSkippedYaCifradas += skipped;
    totalEncrypted += toUpdate.length;
    idsSospechosas.push(...sospechosas);

    if (!options.dryRun && toUpdate.length > 0) {
      const operaciones = toUpdate.map(({ id, descripcionCifrada }) =>
        prisma.transaccion.update({
          where: { id },
          data: { descripcion: descripcionCifrada },
        }),
      );
      await prisma.$transaction(operaciones, {
        timeout: TRANSACTION_TIMEOUT_MS,
        maxWait: TRANSACTION_MAX_WAIT_MS,
      });
    }

    cursor = rows[rows.length - 1].id;
    if (rows.length < batchSize) break;
  }

  if (idsSospechosas.length > 0) {
    console.warn(
      `[backfill-descripcion-encryption] ${idsSospechosas.length} fila(s) con prefijo "v1:" que NO parsean como ciphertext válido — NO se cifraron, requieren revisión humana. ids: ${idsSospechosas.join(', ')}`,
    );
  }

  return {
    totalScanned,
    totalEncrypted,
    totalSkippedYaCifradas,
    totalSospechosas: idsSospechosas.length,
  };
}

function printSummary(
  summary: DescripcionBackfillSummary,
  dryRun: boolean,
): void {
  console.log(
    `Backfill de cifrado de descripcion (ADR-013)${dryRun ? ' (--dry-run, nada se escribió)' : ''}:`,
  );
  console.log(`  Filas escaneadas: ${summary.totalScanned}`);
  console.log(`  Filas cifradas: ${summary.totalEncrypted}`);
  console.log(
    `  Filas ya cifradas (saltadas): ${summary.totalSkippedYaCifradas}`,
  );
  console.log(
    `  Filas sospechosas (prefijo v1: no parseable, revisión humana): ${summary.totalSospechosas}`,
  );
}

/**
 * Wiring de script real: gate de seguridad ANTES de cualquier conexión a
 * Prisma (ver assertDestructiveDbAllowed) + ejecución de
 * runBackfillDescripcionEncryption. Exportado para poder testear el gate sin
 * BD (ver backfill-descripcion-encryption.spec.ts).
 */
/**
 * Parsea `--batch-size=N` de los args del script. Devuelve `undefined` si el
 * flag no está (se usa DEFAULT_BATCH_SIZE) y LANZA si el valor no es un entero
 * positivo — mejor fallar ruidoso al arrancar que correr con un batch inválido
 * contra prod. Exportada para testearla sin invocar main().
 */
export function parseBatchSizeArg(argv: string[]): number | undefined {
  const flag = argv.find((arg) => arg.startsWith('--batch-size='));
  if (!flag) return undefined;

  const raw = flag.slice('--batch-size='.length);
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(
      `--batch-size debe ser un entero positivo (recibido: "${raw}").`,
    );
  }
  return value;
}

export async function main(
  argv: string[] = process.argv.slice(2),
): Promise<void> {
  const dryRun = argv.includes('--dry-run');
  const batchSize = parseBatchSizeArg(argv);

  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'backfill-descripcion-encryption requiere DATABASE_URL o DIRECT_URL en el entorno.',
    );
  }

  // Misma postura que backfill-categorias.ts: opt-in explícito
  // (ALLOW_DESTRUCTIVE_DB=1) + rechazo de cadenas de producción, con la
  // MISMA excepción angosta y supervisada vía CONFIRM_PROD_BACKFILL — pero
  // con un `expected` PROPIO de esta operación, para que confirmar el
  // backfill de categorías no habilite por accidente correr este.
  assertDestructiveDbAllowed({
    connectionString,
    allowProductionAck: {
      envVar: 'CONFIRM_PROD_BACKFILL',
      expected: 'adr-013-descripcion-encryption',
      operation: 'ADR-013 Transaccion.descripcion encryption backfill',
    },
  });

  const rawKey = process.env.ENCRYPTION_KEY;
  if (!rawKey || !isValid32ByteBase64Key(rawKey)) {
    throw new Error(
      'backfill-descripcion-encryption requiere ENCRYPTION_KEY (base64, 32 bytes exactos — AES-256, ADR-013) en el entorno.',
    );
  }
  const crypto = new AesGcmCryptoService(Buffer.from(rawKey, 'base64'));

  const prisma = new PrismaClient({ adapter: new PrismaPg(connectionString) });
  try {
    const summary = await runBackfillDescripcionEncryption(prisma, crypto, {
      dryRun,
      ...(batchSize !== undefined ? { batchSize } : {}),
    });
    printSummary(summary, dryRun);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Redacta credenciales embebidas en connection strings (`protocolo://user:pass@host`)
 * dentro de un mensaje de error — un error de conexión de Prisma/pg puede
 * incluir el DATABASE_URL/DIRECT_URL completo (con password) en su mensaje.
 * No existe un helper de scrub genérico reusable en el repo (el scrub
 * existente en el boundary HTTP es específico de montos de dinero, no de
 * credenciales) — esta es una redacción mínima e inline, propia de este
 * script. Exportada para poder testearla sin invocar main().
 */
export function scrubCredenciales(mensaje: string): string {
  return mensaje.replace(/:\/\/[^:@/\s]+:[^@/\s]+@/g, '://***:***@');
}

/**
 * Loguea un fallo del backfill scrubbeando cualquier credencial embebida en
 * el mensaje/stack del error ANTES de imprimirlo (nunca loguear el DSN
 * crudo). Extraída de la guarda `require.main === module` para poder
 * testearla directamente (ver backfill-descripcion-encryption.spec.ts).
 */
export function logBackfillFailure(error: unknown): void {
  const detalle =
    error instanceof Error
      ? scrubCredenciales(error.stack ?? error.message)
      : scrubCredenciales(String(error));
  console.error('Backfill falló:', detalle);
}

// Ejecuta solo como script (ts-node), no al importarse en tests.
if (require.main === module) {
  main()
    .then(() => {
      console.log('Backfill completado.');
    })
    .catch((error) => {
      logBackfillFailure(error);
      process.exitCode = 1;
    });
}
