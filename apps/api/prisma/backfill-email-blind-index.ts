import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { assertDestructiveDbAllowed } from '../src/infrastructure/persistence/db-safety';
import {
  AesGcmCryptoService,
  tieneFormatoV1,
} from '../src/infrastructure/persistence/aes-gcm-crypto.service';
import { HmacBlindIndexService } from '../src/infrastructure/persistence/hmac-blind-index.service';
import { deriveBlindIndexKey } from '../src/composition/derive-blind-index-key';
import { isValid32ByteBase64Key } from '../src/config/env';
import type { ICryptoService } from '../src/application/ports/crypto-service.port';
import type { IBlindIndexService } from '../src/application/ports/blind-index-service.port';

/**
 * backfill-email-blind-index.ts (US-035 Slice 1 follow-up).
 *
 * Backfill de UNA vez, supervisado e idempotente: cifra las filas
 * `User.email` EXISTENTES que todavía están en texto plano y les computa el
 * `emailBlindIndex` correspondiente, ahora que el login busca por blind
 * index en vez de por email en claro (ver
 * prisma-user-credential.repository.ts) — sin este backfill, los usuarios
 * creados ANTES de este change (email en claro, sin blind index) nunca más
 * podrían loguearse.
 *
 * Clasificación por fila (mismo esquema que backfill-descripcion-encryption.ts),
 * tres salidas:
 *  1. Ciphertext v1 VÁLIDO (`tieneFormatoV1()`) → SALTAR (ya migrada). Esto
 *     es lo que hace idempotente al script.
 *  2. Texto plano sin prefijo `v1:` → CIFRAR + computar blind index.
 *  3. "Sospechosa": prefijo `v1:` pero sin la estructura de 4 segmentos →
 *     NI se cifra NI se cuenta como ya-cifrada (cifrarla sería doble-cifrado
 *     si en realidad fuera un ciphertext corrupto). Se reporta aparte y se
 *     loguea su id (NUNCA el email) para revisión humana.
 *
 * Usuarios con `email = null` (demo, DEMO-AUTH-05) se saltan siempre — no
 * hay nada que cifrar ni indexar.
 *
 * Estructurado igual que backfill-descripcion-encryption.ts:
 * `runBackfillEmailBlindIndex` es la lógica pura (testeable con un fake
 * client — ver backfill-email-blind-index.spec.ts), `main()` es el wiring de
 * script real (gate + PrismaClient + crypto/blindIndex reales), guardado
 * tras `require.main === module`.
 */

/** Cliente mínimo requerido por el backfill (mirror de DescripcionBackfillClient). */
export interface EmailBackfillClient {
  user: {
    findMany(args: {
      where: { id?: { gt: string }; email: { not: null } };
      orderBy: { id: 'asc' };
      take: number;
      select: { id: true; email: true };
    }): Promise<Array<{ id: string; email: string | null }>>;
    update(args: {
      where: { id: string };
      data: { email: string; emailBlindIndex: string };
    }): Promise<{ id: string }>;
  };
  $transaction<T>(
    operaciones: Promise<T>[],
    options?: { timeout?: number; maxWait?: number },
  ): Promise<T[]>;
}

export interface EmailBackfillSummary {
  /** Total de filas escaneadas (todos los User con email no-nulo). */
  readonly totalScanned: number;
  /** Filas cuyo email se cifró (+ blind index computado) en esta corrida. */
  readonly totalEncrypted: number;
  /** Filas que YA tenían un ciphertext v1 VÁLIDO y se saltaron. */
  readonly totalSkippedYaCifradas: number;
  /**
   * Filas con prefijo `v1:` que NO parsean como ciphertext v1 válido —
   * requieren revisión humana. Ver docstring del módulo.
   */
  readonly totalSospechosas: number;
}

const VERSION_PREFIX = 'v1:';

type ClasificacionFila = 'plaintext' | 'ciphertext' | 'sospechosa';

/** Mismo esquema de clasificación que backfill-descripcion-encryption.ts (ver clasificarFila ahí). */
function clasificarFila(email: string): ClasificacionFila {
  if (!email.startsWith(VERSION_PREFIX)) {
    return 'plaintext';
  }
  return tieneFormatoV1(email) ? 'ciphertext' : 'sospechosa';
}

/**
 * Decide, para UN batch ya leído de la BD, qué filas cifrar+indexar, cuáles
 * saltar y cuáles son sospechosas. Lógica pura (sin I/O) — separada de
 * `runBackfillEmailBlindIndex` para poder testearla directo, sin un fake de
 * Prisma completo. Filas con `email: null` NUNCA llegan acá — el caller las
 * excluye en el `findMany` (`where: { email: { not: null } }`).
 */
export function partitionBatch(
  rows: ReadonlyArray<{ id: string; email: string }>,
  crypto: ICryptoService,
  blindIndex: IBlindIndexService,
): {
  toUpdate: ReadonlyArray<{
    id: string;
    emailCifrado: string;
    emailBlindIndex: string;
  }>;
  skipped: number;
  /** Solo ids — NUNCA el email (ver política de logueo del módulo). */
  sospechosas: ReadonlyArray<string>;
} {
  const toUpdate: Array<{
    id: string;
    emailCifrado: string;
    emailBlindIndex: string;
  }> = [];
  const sospechosas: string[] = [];
  let skipped = 0;

  for (const row of rows) {
    const clasificacion = clasificarFila(row.email);

    if (clasificacion === 'ciphertext') {
      skipped++;
      continue;
    }
    if (clasificacion === 'sospechosa') {
      sospechosas.push(row.id);
      continue;
    }

    const normalizado = row.email.trim().toLowerCase();
    toUpdate.push({
      id: row.id,
      emailCifrado: crypto.encrypt(normalizado),
      emailBlindIndex: blindIndex.compute(normalizado),
    });
  }

  return { toUpdate, skipped, sospechosas };
}

/** Mismo tamaño de batch/timeouts que backfill-descripcion-encryption.ts (mismo perfil de latencia contra el pooler de Supabase). */
const DEFAULT_BATCH_SIZE = 100;
const TRANSACTION_TIMEOUT_MS = 30_000;
const TRANSACTION_MAX_WAIT_MS = 10_000;

/**
 * Recorre `User` en batches (paginación por cursor `id`, ascendente),
 * excluyendo `email: null` desde la query (demo users, DEMO-AUTH-05, no
 * tienen nada que cifrar). Por batch: cifra + indexa las filas en texto
 * plano y las persiste con `update()` individual dentro de un
 * `$transaction` (cada fila produce un ciphertext e index distintos — IV
 * aleatorio en el cifrado — así que no se puede agrupar en un `updateMany`).
 *
 * Nunca loguea `email` en texto plano — solo conteos y, para las filas
 * sospechosas, sus ids.
 */
export async function runBackfillEmailBlindIndex(
  prisma: EmailBackfillClient,
  crypto: ICryptoService,
  blindIndex: IBlindIndexService,
  options: { dryRun: boolean; batchSize?: number } = { dryRun: false },
): Promise<EmailBackfillSummary> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;

  let cursor: string | undefined;
  let totalScanned = 0;
  let totalEncrypted = 0;
  let totalSkippedYaCifradas = 0;
  const idsSospechosas: string[] = [];

  for (;;) {
    const rows = await prisma.user.findMany({
      where: {
        ...(cursor ? { id: { gt: cursor } } : {}),
        email: { not: null },
      },
      orderBy: { id: 'asc' },
      take: batchSize,
      select: { id: true, email: true },
    });

    if (rows.length === 0) break;

    // `where: { email: { not: null } }` ya excluye los null — el filtro acá
    // es solo para satisfacer el tipo (findMany conserva `email: string | null`).
    const rowsConEmail = rows.filter(
      (row): row is { id: string; email: string } => row.email !== null,
    );

    totalScanned += rowsConEmail.length;
    const { toUpdate, skipped, sospechosas } = partitionBatch(
      rowsConEmail,
      crypto,
      blindIndex,
    );
    totalSkippedYaCifradas += skipped;
    totalEncrypted += toUpdate.length;
    idsSospechosas.push(...sospechosas);

    if (!options.dryRun && toUpdate.length > 0) {
      const operaciones = toUpdate.map(
        ({ id, emailCifrado, emailBlindIndex: bi }) =>
          prisma.user.update({
            where: { id },
            data: { email: emailCifrado, emailBlindIndex: bi },
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
      `[backfill-email-blind-index] ${idsSospechosas.length} fila(s) con prefijo "v1:" que NO parsean como ciphertext válido — NO se cifraron, requieren revisión humana. ids: ${idsSospechosas.join(', ')}`,
    );
  }

  return {
    totalScanned,
    totalEncrypted,
    totalSkippedYaCifradas,
    totalSospechosas: idsSospechosas.length,
  };
}

function printSummary(summary: EmailBackfillSummary, dryRun: boolean): void {
  console.log(
    `Backfill de cifrado + blind index de email (US-035)${dryRun ? ' (--dry-run, nada se escribió)' : ''}:`,
  );
  console.log(`  Filas escaneadas: ${summary.totalScanned}`);
  console.log(`  Filas cifradas + indexadas: ${summary.totalEncrypted}`);
  console.log(
    `  Filas ya cifradas (saltadas): ${summary.totalSkippedYaCifradas}`,
  );
  console.log(
    `  Filas sospechosas (prefijo v1: no parseable, revisión humana): ${summary.totalSospechosas}`,
  );
}

/** Idéntico contrato que backfill-descripcion-encryption.ts (ver ahí). */
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

/**
 * Wiring de script real: gate de seguridad ANTES de cualquier conexión a
 * Prisma (ver assertDestructiveDbAllowed) + ejecución de
 * runBackfillEmailBlindIndex. Exportado para poder testear el gate sin BD
 * (ver backfill-email-blind-index.spec.ts).
 */
export async function main(
  argv: string[] = process.argv.slice(2),
): Promise<void> {
  const dryRun = argv.includes('--dry-run');
  const batchSize = parseBatchSizeArg(argv);

  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'backfill-email-blind-index requiere DATABASE_URL o DIRECT_URL en el entorno.',
    );
  }

  // Misma postura que backfill-descripcion-encryption.ts: opt-in explícito
  // (ALLOW_DESTRUCTIVE_DB=1) + rechazo de cadenas de producción, con un
  // `expected` PROPIO de esta operación (namespacing) — confirmar este
  // backfill no habilita por accidente correr otro.
  assertDestructiveDbAllowed({
    connectionString,
    allowProductionAck: {
      envVar: 'CONFIRM_PROD_BACKFILL',
      expected: 'us-035-email-blind-index',
      operation: 'US-035 User.email blind index backfill',
    },
  });

  const rawKey = process.env.ENCRYPTION_KEY;
  if (!rawKey || !isValid32ByteBase64Key(rawKey)) {
    throw new Error(
      'backfill-email-blind-index requiere ENCRYPTION_KEY (base64, 32 bytes exactos — AES-256, ADR-013) en el entorno.',
    );
  }
  const encryptionKey = Buffer.from(rawKey, 'base64');
  const crypto = new AesGcmCryptoService(encryptionKey);
  const blindIndex = new HmacBlindIndexService(
    deriveBlindIndexKey(encryptionKey),
  );

  const prisma = new PrismaClient({ adapter: new PrismaPg(connectionString) });
  try {
    const summary = await runBackfillEmailBlindIndex(
      prisma,
      crypto,
      blindIndex,
      {
        dryRun,
        ...(batchSize !== undefined ? { batchSize } : {}),
      },
    );
    printSummary(summary, dryRun);
  } finally {
    await prisma.$disconnect();
  }
}

/** Idéntico a backfill-descripcion-encryption.ts (ver ahí) — sin helper compartido reusable en el repo (deuda aceptada, ver ese docstring). */
export function scrubCredenciales(mensaje: string): string {
  return mensaje.replace(/:\/\/[^:@/\s]+:[^@/\s]+@/g, '://***:***@');
}

/** Idéntico a backfill-descripcion-encryption.ts (ver ahí). */
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
