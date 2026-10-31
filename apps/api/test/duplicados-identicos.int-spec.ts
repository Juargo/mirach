/**
 * duplicados-identicos.int-spec.ts — issue #114 (IMP-05, IMP-20, ADR-004 §5).
 *
 * DetectarDuplicadosUseCase over PrismaTransaccionExistenteReader against a
 * real DB: two identical charges on the same day are two movements, so a
 * second identical purchase is never lost, while a stored copy still makes
 * the same row of a re-uploaded file a duplicate. Rows are encrypted at rest
 * (ADR-009), as the reader decrypts them.
 *
 * Requires a real DB. Run via
 * `ALLOW_DESTRUCTIVE_DB=1 pnpm api test:integration -- duplicados-identicos`.
 */
import 'dotenv/config';
import type { PrismaClient } from '@prisma/client';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';
import { loadEnv } from '../src/config/env';
import { AesGcmCryptoService } from '../src/infrastructure/persistence/aes-gcm-crypto.service';
import { PrismaTransaccionExistenteReader } from '../src/infrastructure/persistence/prisma-transaccion-existente.reader';
import { DetectarDuplicadosUseCase } from '../src/application/use-cases/detectar-duplicados.use-case';
import { Transaccion } from '../src/domain/value-objects/transaccion';
import { NoOpLogger } from './support/logger.double';

const ALLOW = process.env.ALLOW_DESTRUCTIVE_DB === '1';
const RUN_ID = `duplicados-identicos-int-${Date.now()}`;
const USER_ID = `u-${RUN_ID}`;
const FECHA = new Date('2026-10-12T00:00:00.000Z');

const copec = () =>
  Transaccion.crear({
    fecha: FECHA,
    descripcion: 'COPEC',
    cargo: 3500n,
    abono: 0n,
  }).getValue();

describe('identical rows on the same day (#114, real DB)', () => {
  let prisma: PrismaClient;
  let crypto: AesGcmCryptoService;
  let useCase: DetectarDuplicadosUseCase;

  async function cuentaCon(sufijo: string, copiasGuardadas: number) {
    const accountId = `${RUN_ID}-${sufijo}`;
    await prisma.account.create({
      data: {
        id: accountId,
        userId: USER_ID,
        banco: 'TestBank',
        tipoCuenta: 'CuentaCorriente',
        numeroCuenta: crypto.encrypt(`ACC-${sufijo}`),
      },
    });
    const ingestaId = `${accountId}-ing`;
    await prisma.ingesta.create({
      data: {
        id: ingestaId,
        userId: USER_ID,
        accountId,
        banco: 'TestBank',
        nombreArchivo: 'test.xlsx',
        estado: 'PROCESADA',
      },
    });
    for (let i = 0; i < copiasGuardadas; i++) {
      await prisma.transaccion.create({
        data: {
          accountId,
          ingestaId,
          fecha: FECHA,
          descripcion: crypto.encrypt('COPEC'),
          cargo: 3500n,
          abono: 0n,
        },
      });
    }
    return accountId;
  }

  beforeAll(async () => {
    if (!ALLOW) return;
    const env = loadEnv();
    crypto = new AesGcmCryptoService(Buffer.from(env.ENCRYPTION_KEY, 'base64'));
    prisma = createPrismaClient(env);
    await prisma.$connect();
    await prisma.user.create({
      data: { id: USER_ID, nombre: `Int ${RUN_ID}` },
    });
    useCase = new DetectarDuplicadosUseCase(
      new PrismaTransaccionExistenteReader(prisma, crypto),
      new NoOpLogger(),
    );
  });

  afterAll(async () => {
    if (!ALLOW) return;
    await prisma.transaccion.deleteMany({
      where: { account: { userId: USER_ID } },
    });
    await prisma.ingesta.deleteMany({ where: { userId: USER_ID } });
    await prisma.account.deleteMany({ where: { userId: USER_ID } });
    await prisma.user.deleteMany({ where: { id: USER_ID } });
    await prisma.$disconnect();
  });

  it('Escenario: dos compras idénticas el mismo día no se pierden', async () => {
    if (!ALLOW) return;
    const accountId = await cuentaCon('primera', 0);
    const result = await useCase.execute({
      accountId,
      transacciones: [copec(), copec()],
    });
    expect(result.getValue().nuevas).toHaveLength(2);
    expect(result.getValue().duplicadas).toBe(0);
  });

  it('a file that overlaps one stored copy keeps the second identical charge', async () => {
    if (!ALLOW) return;
    const accountId = await cuentaCon('solapada', 1);
    const segunda = copec();
    const result = await useCase.execute({
      accountId,
      transacciones: [copec(), segunda],
    });
    expect(result.getValue().nuevas).toEqual([segunda]);
    expect(result.getValue().duplicadas).toBe(1);
  });

  it('Escenario: subir dos veces la misma cartola no duplica', async () => {
    if (!ALLOW) return;
    const accountId = await cuentaCon('repetida', 2);
    const result = await useCase.execute({
      accountId,
      transacciones: [copec(), copec()],
    });
    expect(result.getValue().nuevas).toHaveLength(0);
    expect(result.getValue().duplicadas).toBe(2);
  });
});
