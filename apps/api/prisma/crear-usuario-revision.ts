import 'dotenv/config';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { assertDestructiveDbAllowed } from '../src/infrastructure/persistence/db-safety';
import { AesGcmCryptoService } from '../src/infrastructure/persistence/aes-gcm-crypto.service';
import { HmacBlindIndexService } from '../src/infrastructure/persistence/hmac-blind-index.service';
import { deriveBlindIndexKey } from '../src/composition/derive-blind-index-key';
import { crearCommitIngesta } from '../src/composition/crear-commit-ingesta';
import { isValid32ByteBase64Key } from '../src/config/env';
import { Argon2PasswordHasher } from '../src/infrastructure/http/auth/argon2-password-hasher';
import { appLogger } from '../src/infrastructure/logging/app-logger';
import { Email } from '../src/domain/value-objects/email';
import { Password } from '../src/domain/value-objects/password';
import { copiarCatalogoTemplate } from '../src/infrastructure/persistence/catalogo-template';
import type { ICryptoService } from '../src/application/ports/crypto-service.port';
import type { IBlindIndexService } from '../src/application/ports/blind-index-service.port';
import type { IPasswordHasher } from '../src/application/ports/password-hasher.port';
import type { IFileReader } from '../src/application/ports/file-reader.port';
import type { CommitIngestaUseCase } from '../src/application/use-cases/commit-ingesta.use-case';

/**
 * crear-usuario-revision.ts (ADR-051) — creates, or refreshes, the ONE account
 * App Review signs in with (email + password, allowlisted by
 * `REVIEW_LOGIN_EMAIL` on the API).
 *
 * Run by hand by the owner. Idempotent: running it again only refreshes the
 * password hash; the catalog template and the sample statement are loaded once
 * (skipped when the user already has categories / any ingesta).
 *
 * It reuses the same blocks as the rest of the auth graph, nothing hand-rolled:
 *   - `Email` / `Password` (domain) validate the inputs.
 *   - `AesGcmCryptoService` / `HmacBlindIndexService` (ADR-013) encrypt the
 *     email and compute its blind index, with the same key derivation as
 *     `container.ts`.
 *   - `Argon2PasswordHasher` hashes the password like the real login verifies.
 *   - `copiarCatalogoTemplate` gives the user the default catalog, as any real
 *     sign-up does.
 *   - `CommitIngestaUseCase` (the use case behind an upload commit) loads the
 *     sample statement `prisma/fixtures/cartola-revision.xlsx` through the real
 *     parser, deduplication and classification.
 *
 * Key identity check (critical, as in the sibling evaluator script): before
 * writing, ONE existing row with an encrypted email is decrypted. If that
 * fails, ENCRYPTION_KEY is not the one the database was written with and the
 * script aborts, because a user written with the wrong key can never be read
 * and would silently pollute the blind index.
 *
 * Never logs the password or its hash. Every error message is a fixed string.
 *
 * Guard: like every one-off write script here it goes through
 * `assertDestructiveDbAllowed`. Production is allowed only with the explicit
 * acknowledgement below, scoped to THIS operation, so confirming it cannot
 * enable another backfill by accident. The guard is NOT baked into the
 * package script on purpose: the owner types the acknowledgement each time.
 *
 * Real run (from `apps/api/`; inline env vars win over `apps/api/.env`):
 *
 *   ALLOW_DESTRUCTIVE_DB=1 CONFIRM_PROD_BACKFILL=crear-usuario-revision \
 *     DATABASE_URL=... DIRECT_URL=... ENCRYPTION_KEY=... \
 *     REVIEW_LOGIN_EMAIL=... REVIEW_LOGIN_PASSWORD='...' \
 *     pnpm review:create-user
 */

const NOMBRE_DEFAULT = 'Cuenta de revisión';
const RUTA_CARTOLA_REVISION = path.join(
  __dirname,
  'fixtures',
  'cartola-revision.xlsx',
);

/** Fixed messages: nothing derived from the password or a domain error is interpolated. */
export const MENSAJES = {
  emailInvalido:
    'REVIEW_LOGIN_EMAIL no tiene un formato de email válido. Abortando sin escribir.',
  passwordInvalida:
    'REVIEW_LOGIN_PASSWORD inválida: no cumple la política de contraseñas. Abortando sin escribir.',
  claveNoCoincide:
    'ENCRYPTION_KEY no coincide con la clave de la BD. Abortando sin escribir.',
  cuentaSocial:
    'Ese email pertenece a una cuenta con Apple o Google, no a una cuenta de revisión. Abortando sin escribir.',
  muestraFallida:
    'La carga de la cartola de muestra falló: el usuario ya quedó creado, volvé a correr el script',
} as const;

export interface CrearUsuarioRevisionInput {
  readonly email: string;
  readonly password: string;
  readonly nombre?: string;
}

export interface CargaMuestraResultado {
  readonly totalTransacciones: number;
  readonly duplicadosOmitidos: number;
}

export interface CrearUsuarioRevisionDeps {
  readonly crypto: ICryptoService;
  readonly blindIndex: IBlindIndexService;
  readonly hasher: IPasswordHasher;
  /** Loads the sample statement for the user. Throws a fixed-message Error on failure. */
  readonly cargarMuestra: (userId: string) => Promise<CargaMuestraResultado>;
}

export interface CrearUsuarioRevisionResultado {
  readonly userId: string;
  readonly email: string;
  readonly creado: boolean;
  readonly catalogoCopiado: boolean;
  readonly muestraCargada: boolean;
}

/**
 * runCrearUsuarioRevision — the whole flow, testable without a database (see
 * crear-usuario-revision.spec.ts). `main()` below is only the real wiring.
 */
export async function runCrearUsuarioRevision(
  prisma: PrismaClient,
  input: CrearUsuarioRevisionInput,
  deps: CrearUsuarioRevisionDeps,
): Promise<CrearUsuarioRevisionResultado> {
  const emailResult = Email.crear(input.email);
  if (emailResult.isFail()) {
    throw new Error(MENSAJES.emailInvalido);
  }
  const email = emailResult.getValue();

  const passwordResult = Password.crear(input.password);
  if (passwordResult.isFail()) {
    throw new Error(MENSAJES.passwordInvalida);
  }
  const password = passwordResult.getValue();

  // Key identity check (see the module docblock). `not: null` already filters
  // nulls in the query; the `=== null` guard only narrows the type.
  const filaConEmail = await prisma.user.findFirst({
    where: { email: { not: null } },
    select: { email: true },
  });
  if (filaConEmail === null || filaConEmail.email === null) {
    console.warn(
      'crear-usuario-revision: no hay ningún usuario con email cifrado contra el cual verificar ENCRYPTION_KEY; continuando sin esa verificación.',
    );
  } else {
    try {
      deps.crypto.decrypt(filaConEmail.email);
    } catch {
      throw new Error(MENSAJES.claveNoCoincide);
    }
  }

  const emailBlindIndex = deps.blindIndex.compute(email.valor);
  const existente = await prisma.user.findUnique({
    where: { emailBlindIndex },
    select: { id: true, appleSub: true, googleSub: true },
  });

  // Never put a password on a real person's account.
  if (
    existente !== null &&
    (existente.appleSub !== null || existente.googleSub !== null)
  ) {
    throw new Error(MENSAJES.cuentaSocial);
  }

  // argon2id is slow and CPU-bound: hash BEFORE opening the transaction.
  const passwordHash = await deps.hasher.hash(password.valor);

  let catalogoCopiado = false;
  const user = await prisma.$transaction(async (tx) => {
    const fila =
      existente === null
        ? await tx.user.create({
            data: {
              nombre: input.nombre ?? NOMBRE_DEFAULT,
              email: deps.crypto.encrypt(email.valor),
              emailBlindIndex,
              passwordHash,
            },
          })
        : await tx.user.update({
            where: { id: existente.id },
            data: { passwordHash },
          });

    // Copy the catalog template once: only when the user owns no category.
    if ((await tx.categoria.count({ where: { userId: fila.id } })) === 0) {
      await copiarCatalogoTemplate(tx, fila.id);
      catalogoCopiado = true;
    }

    return fila;
  });

  // Load the sample statement once: only when the user has no ingesta yet.
  // (Re-running the commit would be deduplicated row by row, but it would
  // still record an empty ingesta each time.)
  let muestraCargada = false;
  if ((await prisma.ingesta.count({ where: { userId: user.id } })) === 0) {
    try {
      await deps.cargarMuestra(user.id);
    } catch (error) {
      // Keep our own fixed message (it may carry the error NAME); anything
      // else (a driver error, say) is replaced so no detail leaks to the log.
      if (
        error instanceof Error &&
        error.message.startsWith(MENSAJES.muestraFallida)
      ) {
        throw error;
      }
      // No `cause` on purpose: a driver error could carry connection details.
      // eslint-disable-next-line preserve-caught-error
      throw new Error(MENSAJES.muestraFallida);
    }
    muestraCargada = true;
  }

  // Only the id and the normalized email: never the password or its hash.
  console.log(
    `crear-usuario-revision: usuario ${existente === null ? 'creado' : 'actualizado'} id=${user.id} email=${email.valor} catalogo=${catalogoCopiado ? 'copiado' : 'ya existía'} muestra=${muestraCargada ? 'cargada' : 'ya existía'}`,
  );

  return {
    userId: user.id,
    email: email.valor,
    creado: existente === null,
    catalogoCopiado,
    muestraCargada,
  };
}

/**
 * cargarMuestraConCommit — loads the statement through the SAME use case the
 * API runs when an upload is committed, with no edits (the default
 * classification applies). A failure becomes a fixed message plus the error
 * name only, never the domain error text.
 */
export async function cargarMuestraConCommit(
  commit: Pick<CommitIngestaUseCase, 'execute'>,
  userId: string,
  fileReader: IFileReader,
): Promise<CargaMuestraResultado> {
  const result = await commit.execute({ fileReader, userId, edits: [] });
  if (result.isFail()) {
    throw new Error(`${MENSAJES.muestraFallida} (${result.getError().name})`);
  }
  const { totalTransacciones, duplicadosOmitidos } = result.getValue();
  return { totalTransacciones, duplicadosOmitidos };
}

function leerCartolaRevision(): IFileReader {
  const buffer = readFileSync(RUTA_CARTOLA_REVISION);
  return {
    getBuffer: () => buffer,
    getOriginalName: () => 'cartola-revision.xlsx',
    getSizeInBytes: () => buffer.length,
  };
}

function requireEnv(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) {
    throw new Error(`crear-usuario-revision requiere ${nombre} en el entorno.`);
  }
  return valor;
}

/** Real wiring: env, safety gate (BEFORE any connection), real services. */
export async function main(): Promise<void> {
  const email = requireEnv('REVIEW_LOGIN_EMAIL');
  const password = requireEnv('REVIEW_LOGIN_PASSWORD');
  const nombre = process.env.REVIEW_LOGIN_NOMBRE;

  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'crear-usuario-revision requiere DATABASE_URL o DIRECT_URL en el entorno.',
    );
  }

  assertDestructiveDbAllowed({
    connectionString,
    allowProductionAck: {
      envVar: 'CONFIRM_PROD_BACKFILL',
      expected: 'crear-usuario-revision',
      operation:
        'Creación de la cuenta de App Review (login por contraseña, ADR-051)',
    },
  });

  const rawKey = process.env.ENCRYPTION_KEY;
  if (!rawKey || !isValid32ByteBase64Key(rawKey)) {
    throw new Error(
      'crear-usuario-revision requiere ENCRYPTION_KEY (base64, 32 bytes exactos; AES-256, ADR-013) en el entorno.',
    );
  }
  const encryptionKey = Buffer.from(rawKey, 'base64');
  const crypto = new AesGcmCryptoService(encryptionKey);
  const blindIndex = new HmacBlindIndexService(
    deriveBlindIndexKey(encryptionKey),
  );
  const hasher = new Argon2PasswordHasher();

  const prisma = new PrismaClient({ adapter: new PrismaPg(connectionString) });
  try {
    const commit = crearCommitIngesta(prisma, crypto, blindIndex, appLogger);
    await runCrearUsuarioRevision(
      prisma,
      { email, password, ...(nombre ? { nombre } : {}) },
      {
        crypto,
        blindIndex,
        hasher,
        cargarMuestra: (userId) =>
          cargarMuestraConCommit(commit, userId, leerCartolaRevision()),
      },
    );
  } finally {
    await prisma.$disconnect();
  }
}

/** Same as the other one-off scripts here: scrub connection-string credentials. */
export function scrubCredenciales(mensaje: string): string {
  return mensaje.replace(/:\/\/[^:@/\s]+:[^@/\s]+@/g, '://***:***@');
}

/** Never receives the password: it only scrubs connection strings. */
export function logCrearUsuarioRevisionFailure(error: unknown): void {
  const detalle =
    error instanceof Error
      ? scrubCredenciales(error.stack ?? error.message)
      : scrubCredenciales(String(error));
  console.error('crear-usuario-revision falló:', detalle);
}

// Runs only as a script (tsx), not when imported by a spec.
if (require.main === module) {
  main()
    .then(() => {
      console.log('crear-usuario-revision completado.');
    })
    .catch((error: unknown) => {
      logCrearUsuarioRevisionFailure(error);
      process.exitCode = 1;
    });
}
