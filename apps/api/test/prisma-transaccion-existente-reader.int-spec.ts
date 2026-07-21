import 'dotenv/config';
import { PrismaService } from '../src/infrastructure/persistence/prisma.service';
import { PrismaTransaccionExistenteReader } from '../src/infrastructure/persistence/prisma-transaccion-existente.reader';
import { NoOpCryptoService } from '../src/infrastructure/persistence/no-op-crypto.service';
import { EstadoIngesta } from '@prisma/client';

const RUN_ID = `it-dup-${Date.now()}`;

/**
 * Integration tests for PrismaTransaccionExistenteReader against a real dev
 * DB (US-005, Slice 2, task 8.1). Covers what a mocked-Prisma unit test
 * cannot: the real bounded WHERE range at the DB boundary, a real
 * decrypt round-trip through NoOpCryptoService, and structural cross-user
 * isolation (RNF-SEC-006 / ISO) enforced by scoping on `accountId`.
 */
describe('PrismaTransaccionExistenteReader (real dev DB)', () => {
  const prisma = new PrismaService();
  const crypto = new NoOpCryptoService();
  const reader = new PrismaTransaccionExistenteReader(prisma, crypto);

  const userIdA = `user-a-${RUN_ID}`;
  const userIdB = `user-b-${RUN_ID}`;
  let accountIdA: string;
  let accountIdB: string;
  let ingestaIdA: string;
  let ingestaIdB: string;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({ data: { id: userIdA, nombre: 'Usuario A' } });
    await prisma.user.create({ data: { id: userIdB, nombre: 'Usuario B' } });

    const accountA = await prisma.account.create({
      data: {
        userId: userIdA,
        banco: 'BancoEstado',
        tipoCuenta: 'Cuenta Corriente',
        numeroCuenta: `NUM-A-${RUN_ID}`,
      },
    });
    accountIdA = accountA.id;

    const accountB = await prisma.account.create({
      data: {
        userId: userIdB,
        banco: 'BancoEstado',
        tipoCuenta: 'Cuenta Corriente',
        numeroCuenta: `NUM-B-${RUN_ID}`,
      },
    });
    accountIdB = accountB.id;

    const ingestaA = await prisma.ingesta.create({
      data: {
        accountId: accountIdA,
        banco: 'BancoEstado',
        nombreArchivo: 'a.xlsx',
        estado: EstadoIngesta.PROCESADA,
      },
    });
    ingestaIdA = ingestaA.id;

    const ingestaB = await prisma.ingesta.create({
      data: {
        accountId: accountIdB,
        banco: 'BancoEstado',
        nombreArchivo: 'b.xlsx',
        estado: EstadoIngesta.PROCESADA,
      },
    });
    ingestaIdB = ingestaB.id;

    // Cuenta A: 3 filas — una ANTES del rango, una DENTRO (en el borde
    // exacto `gte`), una DESPUÉS del rango.
    await prisma.transaccion.createMany({
      data: [
        {
          ingestaId: ingestaIdA,
          accountId: accountIdA,
          fecha: new Date('2026-06-30T00:00:00.000Z'), // antes del rango
          descripcion: 'Fuera de rango (antes)',
          cargo: 1000n,
          abono: 0n,
        },
        {
          ingestaId: ingestaIdA,
          accountId: accountIdA,
          fecha: new Date('2026-07-01T00:00:00.000Z'), // borde gte exacto
          descripcion: 'Compra en el borde',
          cargo: 5000n,
          abono: 0n,
        },
        {
          ingestaId: ingestaIdA,
          accountId: accountIdA,
          fecha: new Date('2026-08-01T00:00:00.000Z'), // después del rango
          descripcion: 'Fuera de rango (después)',
          cargo: 2000n,
          abono: 0n,
        },
      ],
    });

    // Cuenta B (OTRO usuario): fila IDÉNTICA en apariencia (misma
    // fecha/descripcion/cargo/abono) a la de cuenta A dentro del rango.
    await prisma.transaccion.create({
      data: {
        ingestaId: ingestaIdB,
        accountId: accountIdB,
        fecha: new Date('2026-07-01T00:00:00.000Z'),
        descripcion: 'Compra en el borde',
        cargo: 5000n,
        abono: 0n,
      },
    });
  });

  afterAll(async () => {
    await prisma.transaccion.deleteMany({
      where: { accountId: { in: [accountIdA, accountIdB] } },
    });
    await prisma.ingesta.deleteMany({
      where: { id: { in: [ingestaIdA, ingestaIdB] } },
    });
    await prisma.account.deleteMany({
      where: { id: { in: [accountIdA, accountIdB] } },
    });
    await prisma.user.deleteMany({ where: { id: { in: [userIdA, userIdB] } } });
    await prisma.$disconnect();
  });

  it('respeta el límite de rango [gte,lte]: solo la fila DENTRO del rango vuelve', async () => {
    const result = await reader.buscarPorCuentaYRango(
      accountIdA,
      new Date('2026-07-01T00:00:00.000Z'),
      new Date('2026-07-31T23:59:59.999Z'),
    );

    expect(result.isOk()).toBe(true);
    const rows = result.getValue();
    expect(rows).toHaveLength(1);
    expect(rows[0].descripcion).toBe('Compra en el borde');
    expect(rows[0].cargo).toBe(5000n);
  });

  it('descripcion vuelve DESCIFRADA (round-trip a través de NoOpCryptoService, identidad en MVP)', async () => {
    const result = await reader.buscarPorCuentaYRango(
      accountIdA,
      new Date('2026-07-01T00:00:00.000Z'),
      new Date('2026-07-31T23:59:59.999Z'),
    );

    expect(result.isOk()).toBe(true);
    expect(result.getValue()[0].descripcion).toBe('Compra en el borde');
  });

  it('RNF-SEC-006 / ISO — cross-user isolation: la fila IDÉNTICA de otro usuario NUNCA vuelve al consultar por accountId propio', async () => {
    const result = await reader.buscarPorCuentaYRango(
      accountIdA,
      new Date('2026-07-01T00:00:00.000Z'),
      new Date('2026-07-31T23:59:59.999Z'),
    );

    expect(result.isOk()).toBe(true);
    const rows = result.getValue();
    // Una sola fila (la de la cuenta A) — la fila idéntica de la cuenta B
    // NUNCA aparece, aunque tenga fecha/descripcion/cargo/abono iguales.
    expect(rows).toHaveLength(1);

    // Consultando directamente por la cuenta B, la fila de B SÍ vuelve — la
    // isolation es estructural (por accountId), no un accidente de datos.
    const resultB = await reader.buscarPorCuentaYRango(
      accountIdB,
      new Date('2026-07-01T00:00:00.000Z'),
      new Date('2026-07-31T23:59:59.999Z'),
    );
    expect(resultB.isOk()).toBe(true);
    expect(resultB.getValue()).toHaveLength(1);
  });
});
