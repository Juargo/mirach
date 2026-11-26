import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { assertDestructiveDbAllowed } from '../src/infrastructure/persistence/db-safety';
import { HmacBlindIndexService } from '../src/infrastructure/persistence/hmac-blind-index.service';
import { deriveBlindIndexKey } from '../src/composition/derive-blind-index-key';
import { isValid32ByteBase64Key } from '../src/config/env';
import { Email } from '../src/domain/value-objects/email';
import { MotivoPermiso } from '../src/domain/value-objects/plan';
import type { IBlindIndexService } from '../src/application/ports/blind-index-service.port';

/**
 * conceder-plus-vitalicio.ts (PLA-11, ADR-015 §4) — grants lifetime Plus to the
 * accounts of the Android testers.
 *
 * Run by hand by the owner, once, when billing is turned on. The source of
 * truth of the benefit is the `PermisoPlan` row this script writes
 * (`tester_vitalicio`, no expiry); mirroring it as a promotional entitlement
 * in RevenueCat is a separate, optional step done in its dashboard.
 *
 * Each tester is found by the email of their account, through the blind index
 * (the email itself is encrypted, ADR-009), so ENCRYPTION_KEY must be the one
 * the database was written with: with another key every email is simply not
 * found and nothing is written. The account must be linked to Apple or Google,
 * because an anonymous account cannot be recovered on another device.
 *
 * Idempotent: an account that already has the grant in force is left as it is;
 * a revoked grant is granted again. It never logs an email: the result of each
 * one is reported by its position in TESTER_EMAILS.
 *
 * Guard: like every one-off write script here it goes through
 * `assertDestructiveDbAllowed`. Production is allowed only with the explicit
 * acknowledgement below, scoped to THIS operation.
 *
 * Real run (from `apps/api/`; inline env vars win over `apps/api/.env`):
 *
 *   ALLOW_DESTRUCTIVE_DB=1 CONFIRM_PROD_BACKFILL=conceder-plus-vitalicio \
 *     DATABASE_URL=... DIRECT_URL=... ENCRYPTION_KEY=... \
 *     TESTER_EMAILS='ana@example.com,beto@example.com' \
 *     pnpm plus:grant-testers
 */

export type ResultadoConcesion =
  | 'concedido'
  | 'ya_lo_tenia'
  | 'no_encontrado'
  | 'sin_identidad'
  | 'email_invalido';

export interface ConcederPlusVitalicioDeps {
  readonly blindIndex: IBlindIndexService;
}

const MOTIVO = MotivoPermiso.TesterVitalicio;

/** One result per email, in the order given. */
export async function runConcederPlusVitalicio(
  prisma: PrismaClient,
  emails: readonly string[],
  deps: ConcederPlusVitalicioDeps,
): Promise<ResultadoConcesion[]> {
  const resultados: ResultadoConcesion[] = [];
  for (const crudo of emails) {
    resultados.push(await conceder(prisma, crudo, deps));
  }
  return resultados;
}

async function conceder(
  prisma: PrismaClient,
  crudo: string,
  deps: ConcederPlusVitalicioDeps,
): Promise<ResultadoConcesion> {
  const email = Email.crear(crudo);
  if (email.isFail()) {
    return 'email_invalido';
  }

  const usuario = await prisma.user.findUnique({
    where: { emailBlindIndex: deps.blindIndex.compute(email.getValue().valor) },
    select: { id: true, appleSub: true, googleSub: true },
  });
  if (usuario === null) {
    return 'no_encontrado';
  }
  if (usuario.appleSub === null && usuario.googleSub === null) {
    return 'sin_identidad';
  }

  const where = { userId_motivo: { userId: usuario.id, motivo: MOTIVO } };
  const actual = await prisma.permisoPlan.findUnique({ where });
  if (actual !== null && actual.revocadoEn === null) {
    return 'ya_lo_tenia';
  }

  const datos = { otorgadoEn: new Date(), venceEn: null, revocadoEn: null };
  await prisma.permisoPlan.upsert({
    where,
    create: { userId: usuario.id, motivo: MOTIVO, ...datos },
    update: datos,
  });
  return 'concedido';
}

/** `a@x.cl, b@y.cl` → the non-empty entries, in order. */
export function leerEmails(crudo: string | undefined): string[] {
  return (crudo ?? '')
    .split(',')
    .map((email) => email.trim())
    .filter((email) => email !== '');
}

/** Real wiring: env, safety gate (BEFORE any connection), real services. */
export async function main(): Promise<ResultadoConcesion[]> {
  const emails = leerEmails(process.env.TESTER_EMAILS);
  if (emails.length === 0) {
    throw new Error(
      'conceder-plus-vitalicio requiere TESTER_EMAILS (emails separados por coma) en el entorno.',
    );
  }

  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'conceder-plus-vitalicio requiere DATABASE_URL o DIRECT_URL en el entorno.',
    );
  }

  assertDestructiveDbAllowed({
    connectionString,
    allowProductionAck: {
      envVar: 'CONFIRM_PROD_BACKFILL',
      expected: 'conceder-plus-vitalicio',
      operation: 'Concesión de Plus de por vida a los testers (PLA-11)',
    },
  });

  const rawKey = process.env.ENCRYPTION_KEY;
  if (!rawKey || !isValid32ByteBase64Key(rawKey)) {
    throw new Error(
      'conceder-plus-vitalicio requiere ENCRYPTION_KEY (base64, 32 bytes exactos; AES-256, ADR-009) en el entorno.',
    );
  }
  const blindIndex = new HmacBlindIndexService(
    deriveBlindIndexKey(Buffer.from(rawKey, 'base64')),
  );

  const prisma = new PrismaClient({ adapter: new PrismaPg(connectionString) });
  try {
    return await runConcederPlusVitalicio(prisma, emails, { blindIndex });
  } finally {
    await prisma.$disconnect();
  }
}

/** Scrubs connection-string credentials, as the other one-off scripts do. */
export function scrubCredenciales(mensaje: string): string {
  return mensaje.replace(/:\/\/[^:@/\s]+:[^@/\s]+@/g, '://***:***@');
}

// Runs only as a script (tsx), not when imported by a spec.
if (require.main === module) {
  main()
    .then((resultados) => {
      resultados.forEach((resultado, indice) => {
        console.log(
          `tester ${indice + 1} de ${resultados.length}: ${resultado}`,
        );
      });
      if (
        resultados.some(
          (resultado) =>
            resultado !== 'concedido' && resultado !== 'ya_lo_tenia',
        )
      ) {
        process.exitCode = 1;
      }
    })
    .catch((error: unknown) => {
      const detalle =
        error instanceof Error ? (error.stack ?? error.message) : String(error);
      console.error(
        'conceder-plus-vitalicio falló:',
        scrubCredenciales(detalle),
      );
      process.exitCode = 1;
    });
}
