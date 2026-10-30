/**
 * mes-financiero.int-spec.ts — issue #111 (PER-08).
 *
 * The monthly readers against a real DB with a cut-off day: every reader
 * uses the same financial month (`filtroFechaPeriodo` / `etiquetaPeriodoSql`),
 * income credits keep the 3-day tolerance and nothing else does, the
 * calendar month (cut-off 1) has no tolerance, and isolation holds.
 *
 * Requires a real DB. Run via
 * `ALLOW_DESTRUCTIVE_DB=1 pnpm api test:integration -- mes-financiero`.
 */
import 'dotenv/config';
import type { PrismaClient } from '@prisma/client';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';
import { loadEnv } from '../src/config/env';
import { AesGcmCryptoService } from '../src/infrastructure/persistence/aes-gcm-crypto.service';
import { BUCKET_IDS } from '../src/infrastructure/persistence/bucket-ids';
import { PrismaResumenMesRepository } from '../src/infrastructure/persistence/prisma-resumen-mes.repository';
import { PrismaDetalleBucketRepository } from '../src/infrastructure/persistence/prisma-detalle-bucket.repository';
import { PrismaMovimientosMesRepository } from '../src/infrastructure/persistence/prisma-movimientos-mes.repository';
import { PrismaPeriodosConDatosReader } from '../src/infrastructure/persistence/prisma-periodos-con-datos.repository';
import { PrismaUltimoPeriodoConDatosReader } from '../src/infrastructure/persistence/prisma-ultimo-periodo-con-datos.repository';
import { PrismaResumenAnualRepository } from '../src/infrastructure/persistence/prisma-resumen-anual.repository';
import { Bucket } from '../src/domain/value-objects/bucket';
import { DiaCorte } from '../src/domain/value-objects/mes-financiero';
import { PeriodoMes } from '../src/domain/value-objects/periodo-mes';
import { PeriodoAnio } from '../src/domain/value-objects/periodo-anio';

const ALLOW = process.env.ALLOW_DESTRUCTIVE_DB === '1';
const RUN_ID = `mes-financiero-int-${Date.now()}`;
const USER_A = `a-${RUN_ID}`;
const USER_B = `b-${RUN_ID}`;

const corte25 = DiaCorte.crear(25).getValue();
const periodo = (valor: string, corte: DiaCorte) =>
  PeriodoMes.crear(valor, corte).getValue();
const dia = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

describe('monthly readers with a cut-off day (#111)', () => {
  let prisma: PrismaClient;
  let crypto: AesGcmCryptoService;

  async function seed(
    userId: string,
    filas: Array<[string | null, bigint, bigint, Date]>,
  ) {
    const accountId = `${userId}-acc`;
    await prisma.account.create({
      data: {
        id: accountId,
        userId,
        banco: 'TestBank',
        tipoCuenta: 'CuentaCorriente',
        numeroCuenta: crypto.encrypt(`ACC-${userId}`),
      },
    });
    const ingestaId = `${userId}-ing`;
    await prisma.ingesta.create({
      data: {
        id: ingestaId,
        userId,
        accountId,
        banco: 'TestBank',
        nombreArchivo: 'test.xlsx',
        estado: 'PROCESADA',
      },
    });
    for (const [bucketId, cargo, abono, fecha] of filas) {
      await prisma.transaccion.create({
        data: {
          accountId,
          ingestaId,
          bucketId,
          cargo,
          abono,
          fecha,
          descripcion: crypto.encrypt('E2E mes financiero'),
        },
      });
    }
  }

  beforeAll(async () => {
    if (!ALLOW) return;
    const env = loadEnv();
    crypto = new AesGcmCryptoService(Buffer.from(env.ENCRYPTION_KEY, 'base64'));
    prisma = createPrismaClient(env);
    await prisma.$connect();
    for (const id of [USER_A, USER_B]) {
      await prisma.user.create({ data: { id, nombre: `Int ${id}` } });
    }
    await seed(USER_A, [
      // Salary on Friday 23 Oct: 2 days before cut-off 25.
      [BUCKET_IDS[Bucket.Ingreso], 0n, 1_000_000n, dia('2026-10-23')],
      // Income 4 days before the cut-off: stays in the previous period.
      [BUCKET_IDS[Bucket.Ingreso], 0n, 50_000n, dia('2026-10-21')],
      // A spend on 23 Oct never moves: it is in 25 sep – 24 oct.
      [BUCKET_IDS[Bucket.Necesidades], 300_000n, 0n, dia('2026-10-23')],
      // Uncategorized row (folds to Deseos) on the cut-off day.
      [null, 40_000n, 0n, dia('2026-10-25')],
      [BUCKET_IDS[Bucket.Ahorro], 100_000n, 0n, dia('2026-11-24')],
    ]);
    await seed(USER_B, [
      [BUCKET_IDS[Bucket.Ingreso], 0n, 777_000n, dia('2026-10-23')],
    ]);
  });

  afterAll(async () => {
    if (!ALLOW) return;
    const users = [USER_A, USER_B];
    await prisma.transaccion.deleteMany({
      where: { account: { userId: { in: users } } },
    });
    await prisma.ingesta.deleteMany({ where: { userId: { in: users } } });
    await prisma.account.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });

  const total = (
    rows: ReadonlyArray<{
      bucket: Bucket;
      totalCargo: bigint;
      totalAbono: bigint;
    }>,
    bucket: Bucket,
  ) => {
    const row = rows.find((r) => r.bucket === bucket);
    return row === undefined ? [0n, 0n] : [row.totalCargo, row.totalAbono];
  };

  it('Escenario: sueldo adelantado por fin de semana — the salary of 23 Oct counts in 25 oct – 24 nov', async () => {
    if (!ALLOW) return;
    const repo = new PrismaResumenMesRepository(prisma);

    const octubre = await repo.sumarPorBucket(
      USER_A,
      periodo('2026-10', corte25),
    );
    expect(total(octubre, Bucket.Ingreso)).toEqual([0n, 1_000_000n]);
    expect(total(octubre, Bucket.Necesidades)).toEqual([0n, 0n]);
    expect(total(octubre, Bucket.Deseos)).toEqual([40_000n, 0n]);
    expect(total(octubre, Bucket.Ahorro)).toEqual([100_000n, 0n]);

    const septiembre = await repo.sumarPorBucket(
      USER_A,
      periodo('2026-09', corte25),
    );
    expect(total(septiembre, Bucket.Ingreso)).toEqual([0n, 50_000n]);
    expect(total(septiembre, Bucket.Necesidades)).toEqual([300_000n, 0n]);
  });

  it('the calendar month has no tolerance: everything of October stays in October', async () => {
    if (!ALLOW) return;
    const repo = new PrismaResumenMesRepository(prisma);
    const octubre = await repo.sumarPorBucket(
      USER_A,
      periodo('2026-10', DiaCorte.CALENDARIO),
    );
    expect(total(octubre, Bucket.Ingreso)).toEqual([0n, 1_050_000n]);
    expect(total(octubre, Bucket.Necesidades)).toEqual([300_000n, 0n]);
    expect(total(octubre, Bucket.Deseos)).toEqual([40_000n, 0n]);
    expect(total(octubre, Bucket.Ahorro)).toEqual([0n, 0n]);
  });

  it('the income detail and the movement list follow the same period', async () => {
    if (!ALLOW) return;
    const detalle = new PrismaDetalleBucketRepository(prisma, crypto);
    const ingresos = await detalle.findByPeriodoYBucket(
      USER_A,
      periodo('2026-10', corte25),
      Bucket.Ingreso,
    );
    expect(ingresos.map((r) => r.abono)).toEqual([1_000_000n]);
    const deseos = await detalle.findByPeriodoYBucket(
      USER_A,
      periodo('2026-10', corte25),
      Bucket.Deseos,
    );
    expect(deseos.map((r) => r.cargo)).toEqual([40_000n]);

    const movimientos = new PrismaMovimientosMesRepository(prisma, crypto);
    const filas = await movimientos.findByPeriodo(
      USER_A,
      periodo('2026-10', corte25),
    );
    expect(filas.map((r) => r.fecha.toISOString().slice(0, 10)).sort()).toEqual(
      ['2026-10-23', '2026-10-25', '2026-11-24'],
    );
  });

  it('the period list and the default period use the same financial month', async () => {
    if (!ALLOW) return;
    const periodos = await new PrismaPeriodosConDatosReader(
      prisma,
    ).periodosConDatos(USER_A, corte25);
    expect(periodos.map((p) => p.valor)).toEqual(['2026-10', '2026-09']);
    expect(periodos[0].fechaInicio).toBe('2026-10-25');

    const calendario = await new PrismaPeriodosConDatosReader(
      prisma,
    ).periodosConDatos(USER_A, DiaCorte.CALENDARIO);
    expect(calendario.map((p) => p.valor)).toEqual(['2026-11', '2026-10']);

    const ultimo = await new PrismaUltimoPeriodoConDatosReader(
      prisma,
    ).ultimoPeriodoConDatos(USER_A, corte25);
    expect(ultimo?.valor).toBe('2026-10');
    expect(ultimo?.fechaFin).toBe('2026-11-24');
  });

  it('the annual breakdown assigns each row to its financial month', async () => {
    if (!ALLOW) return;
    const rows = await new PrismaResumenAnualRepository(
      prisma,
    ).sumarPorBucketAnual(USER_A, PeriodoAnio.crear(2026).getValue(), corte25);
    const de = (mes: string) => rows.filter((r) => r.mes === mes);
    expect(total(de('2026-10'), Bucket.Ingreso)).toEqual([0n, 1_000_000n]);
    expect(total(de('2026-09'), Bucket.Ingreso)).toEqual([0n, 50_000n]);
    expect(total(de('2026-09'), Bucket.Necesidades)).toEqual([300_000n, 0n]);
    expect(total(de('2026-10'), Bucket.Ahorro)).toEqual([100_000n, 0n]);
    expect(new Set(rows.map((r) => r.mes)).size).toBe(12);
  });

  it('isolation (RNF-SEC-006): B never sees A and A never sees B', async () => {
    if (!ALLOW) return;
    const repo = new PrismaResumenMesRepository(prisma);
    const b = await repo.sumarPorBucket(USER_B, periodo('2026-10', corte25));
    expect(total(b, Bucket.Ingreso)).toEqual([0n, 777_000n]);
    expect(total(b, Bucket.Necesidades)).toEqual([0n, 0n]);
    const periodosB = await new PrismaPeriodosConDatosReader(
      prisma,
    ).periodosConDatos(USER_B, corte25);
    expect(periodosB.map((p) => p.valor)).toEqual(['2026-10']);
  });
});
