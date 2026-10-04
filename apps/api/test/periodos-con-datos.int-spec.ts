import 'dotenv/config';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';
import { loadEnv } from '../src/config/env';
import { PrismaPeriodosConDatosReader } from '../src/infrastructure/persistence/prisma-periodos-con-datos.repository';
import { PrismaResumenMesRepository } from '../src/infrastructure/persistence/prisma-resumen-mes.repository';
import { PrismaUltimoPeriodoConDatosReader } from '../src/infrastructure/persistence/prisma-ultimo-periodo-con-datos.repository';
import { ListarPeriodosConDatosUseCase } from '../src/application/use-cases/listar-periodos-con-datos.use-case';
import { PeriodoMes } from '../src/domain/value-objects/periodo-mes';
import { USER_ID_FIJO } from '../src/infrastructure/persistence/constants';

/**
 * PrismaPeriodosConDatosReader (integration, real DB), two-user pattern.
 *
 * User A: expense month (2026-01), income-only month (2026-02), a month whose
 * only movements are in the "internal" Desconocido category (2026-04), and two
 * movements astride the 2026-05/2026-06 boundary in UTC (one at
 * 2026-05-31T23:59:59.999Z, one at 2026-06-01T00:00:00.000Z).
 * User B: months A does not have (2026-03, 2026-08).
 */
const RUN_ID = `periodosint-${Date.now()}`;
const USER_A = `${USER_ID_FIJO}-${RUN_ID}`;
const USER_B = `user-b-${RUN_ID}`;
const USER_C = `user-c-${RUN_ID}`; // sin movimientos

describe('PrismaPeriodosConDatosReader (integration — real DB)', () => {
  const prisma = createPrismaClient(loadEnv());
  const reader = new PrismaPeriodosConDatosReader(prisma);
  const useCase = new ListarPeriodosConDatosUseCase(reader);

  let accountA: string;
  let accountB: string;
  let ingestaA: string;
  let ingestaB: string;

  async function tx(
    accountId: string,
    ingestaId: string,
    fecha: string,
    cargo: bigint,
    abono: bigint,
    categoriaId?: string,
  ) {
    await prisma.transaccion.create({
      data: {
        accountId,
        ingestaId,
        fecha: new Date(fecha),
        cargo,
        abono,
        descripcion: `mov ${fecha}`,
        ...(categoriaId ? { categoriaId } : {}),
      },
    });
  }

  beforeAll(async () => {
    await prisma.$connect();
    for (const id of [USER_A, USER_B, USER_C]) {
      await prisma.user.create({ data: { id, nombre: `Test ${id}` } });
    }
    accountA = (
      await prisma.account.create({
        data: {
          userId: USER_A,
          banco: 'BCI',
          tipoCuenta: 'Cuenta Corriente',
          numeroCuenta: `bci-a-${RUN_ID}`,
        },
      })
    ).id;
    accountB = (
      await prisma.account.create({
        data: {
          userId: USER_B,
          banco: 'Santander',
          tipoCuenta: 'Cuenta Corriente',
          numeroCuenta: `san-b-${RUN_ID}`,
        },
      })
    ).id;
    ingestaA = (
      await prisma.ingesta.create({
        data: {
          userId: USER_A,
          accountId: accountA,
          banco: 'BCI',
          nombreArchivo: `a-${RUN_ID}.xlsx`,
          estado: 'PROCESADA',
        },
      })
    ).id;
    ingestaB = (
      await prisma.ingesta.create({
        data: {
          userId: USER_B,
          accountId: accountB,
          banco: 'Santander',
          nombreArchivo: `b-${RUN_ID}.xlsx`,
          estado: 'PROCESADA',
        },
      })
    ).id;

    const interna = await prisma.categoria.create({
      data: {
        userId: USER_A,
        bucketId: 'bucket-deseos',
        nombre: `Desconocido-${RUN_ID}`,
        esInterna: true,
      },
    });

    // Gasto en enero (dos movimientos: no debe duplicar el mes).
    await tx(accountA, ingestaA, '2026-01-10T12:00:00.000Z', 10000n, 0n);
    await tx(accountA, ingestaA, '2026-01-20T12:00:00.000Z', 5000n, 0n);
    // Solo ingreso en febrero.
    await tx(accountA, ingestaA, '2026-02-05T12:00:00.000Z', 0n, 900000n);
    // Solo movimientos de la categoría interna en abril.
    await tx(
      accountA,
      ingestaA,
      '2026-04-15T12:00:00.000Z',
      3000n,
      0n,
      interna.id,
    );
    // Frontera de mes en UTC.
    await tx(accountA, ingestaA, '2026-05-31T23:59:59.999Z', 1000n, 0n);
    await tx(accountA, ingestaA, '2026-06-01T00:00:00.000Z', 2000n, 0n);

    // Usuario B: meses que A no tiene.
    await tx(accountB, ingestaB, '2026-03-05T00:00:00.000Z', 0n, 500000n);
    await tx(accountB, ingestaB, '2026-08-05T00:00:00.000Z', 7000n, 0n);
  });

  afterAll(async () => {
    await prisma.transaccion.deleteMany({
      where: { ingestaId: { in: [ingestaA, ingestaB] } },
    });
    await prisma.categoria.deleteMany({ where: { userId: USER_A } });
    await prisma.ingesta.deleteMany({
      where: { id: { in: [ingestaA, ingestaB] } },
    });
    await prisma.account.deleteMany({
      where: { id: { in: [accountA, accountB] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [USER_A, USER_B, USER_C] } },
    });
    await prisma.$disconnect();
  });

  it('A ve exactamente sus meses, del más reciente al más antiguo, sin duplicados', async () => {
    expect(await useCase.execute({ userId: USER_A })).toEqual([
      '2026-06',
      '2026-05',
      '2026-04',
      '2026-02',
      '2026-01',
    ]);
  });

  it('isolation (RNF-SEC-006): los meses de B nunca aparecen en A, ni al revés', async () => {
    const a = await useCase.execute({ userId: USER_A });
    const b = await useCase.execute({ userId: USER_B });

    expect(a).not.toContain('2026-03');
    expect(a).not.toContain('2026-08');
    expect(b).toEqual(['2026-08', '2026-03']);
  });

  it('usuario sin movimientos o inexistente → []', async () => {
    expect(await useCase.execute({ userId: USER_C })).toEqual([]);
    expect(await useCase.execute({ userId: `no-existe-${RUN_ID}` })).toEqual(
      [],
    );
  });

  it('un mes de solo ingresos y uno de solo categoría interna cuentan', async () => {
    const a = await useCase.execute({ userId: USER_A });

    expect(a).toContain('2026-02');
    expect(a).toContain('2026-04');
  });

  it('la frontera UTC coincide con /api/resumen: 23:59:59.999Z del 31 es mayo, 00:00Z del 1 es junio', async () => {
    const a = await useCase.execute({ userId: USER_A });
    expect(a).toContain('2026-05');
    expect(a).toContain('2026-06');

    // Misma derivación que el default de /api/resumen.
    const ultimo = new PrismaUltimoPeriodoConDatosReader(prisma);
    expect((await ultimo.ultimoPeriodoConDatos(USER_A))?.valor).toBe(a[0]);

    // Y cada mes listado produce datos en el reader del resumen (mismo
    // rango [desde, hasta) de PeriodoMes).
    const resumen = new PrismaResumenMesRepository(prisma);
    for (const valor of a) {
      const periodo = PeriodoMes.crear(valor).getValue();
      const filas = await resumen.sumarPorBucket(USER_A, periodo);
      const hayDatos = filas.some(
        (f) => f.totalCargo > 0n || f.totalAbono > 0n,
      );
      expect({ valor, hayDatos }).toEqual({ valor, hayDatos: true });
    }
  });
});
