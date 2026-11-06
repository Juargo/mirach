import 'dotenv/config';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';
import { loadEnv } from '../src/config/env';
import { AesGcmCryptoService } from '../src/infrastructure/persistence/aes-gcm-crypto.service';
import { PrismaAprendizajeClasificacionWriter } from '../src/infrastructure/persistence/prisma-aprendizaje-clasificacion.writer';
import { BUCKET_IDS } from '../src/infrastructure/persistence/bucket-ids';
import { crearCatalogo } from '../src/composition/crear-catalogo';
import { Bucket } from '../src/domain/value-objects/bucket';
import { PatronNoEncontradoError } from '../src/domain/errors/patron-no-encontrado.error';
import { NoOpLogger } from './support/logger.double';
import { crearCatalogoParaUsuario } from './support/catalogo.fixture';
import { categoriaIdDe } from './helpers/categoria-fixture';

/**
 * Classification learning against a real database (CLA-15, CLA-17,
 * ADR-004:49): saving a pattern and moving the coinciding movements of the
 * month is ONE transaction; manual rows, other periods, incomes and another
 * user's rows never move nor count (RNF-SEC-006).
 *
 * The descriptions are encrypted at rest (ADR-009), so this also proves the
 * matching runs on the decrypted text. "zqxshop" is not a template pattern.
 */
const RUN_ID = `aprendizajeint-${Date.now()}`;
const USER_A = `user-a-${RUN_ID}`;
const USER_B = `user-b-${RUN_ID}`;

const JULIO = new Date('2026-07-15T00:00:00.000Z');
const JUNIO = new Date('2026-06-15T00:00:00.000Z');

describe('classification learning (integration — real DB)', () => {
  const env = loadEnv();
  const prisma = createPrismaClient(env);
  const crypto = new AesGcmCryptoService(
    Buffer.from(env.ENCRYPTION_KEY, 'base64'),
  );
  const catalogo = crearCatalogo(prisma, crypto, new NoOpLogger());

  const cuentas: Record<string, { accountId: string; ingestaId: string }> = {};
  let supermercadoA: string;
  let comidaA: string;

  beforeAll(async () => {
    await prisma.$connect();
    for (const userId of [USER_A, USER_B]) {
      await prisma.user.create({
        data: { id: userId, nombre: `Test ${userId}` },
      });
      await crearCatalogoParaUsuario(prisma, userId);
      const account = await prisma.account.create({
        data: {
          userId,
          banco: 'BCI',
          tipoCuenta: 'Cuenta Corriente',
          numeroCuenta: `bci-${userId}`,
        },
      });
      const ingesta = await prisma.ingesta.create({
        data: {
          userId,
          accountId: account.id,
          banco: 'BCI',
          nombreArchivo: `${userId}.xlsx`,
          estado: 'PROCESADA',
        },
      });
      cuentas[userId] = { accountId: account.id, ingestaId: ingesta.id };
    }
    const de = (userId: string, bucket: Bucket, nombre: string) =>
      categoriaIdDe(prisma, { userId, bucket, nombre });
    supermercadoA = await de(USER_A, Bucket.Necesidades, 'Supermercado');
    comidaA = await de(USER_A, Bucket.Deseos, 'Comida');
  });

  afterEach(async () => {
    const userIds = [USER_A, USER_B];
    await prisma.transaccion.deleteMany({
      where: { account: { userId: { in: userIds } } },
    });
    // Remove only the patterns the tests created; keep the template catalog.
    await prisma.patronClasificacion.deleteMany({
      where: { userId: { in: userIds }, patron: { startsWith: 'zqx' } },
    });
  });

  afterAll(async () => {
    const userIds = [USER_A, USER_B];
    await prisma.transaccion.deleteMany({
      where: { account: { userId: { in: userIds } } },
    });
    await prisma.ingesta.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.account.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.patronClasificacion.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.categoria.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  const crearTx = (
    userId: string,
    descripcion: string,
    opts: {
      fecha?: Date;
      cargo?: bigint;
      abono?: bigint;
      categoriaId?: string | null;
      clasificacionManual?: boolean;
    } = {},
  ) =>
    prisma.transaccion.create({
      data: {
        accountId: cuentas[userId].accountId,
        ingestaId: cuentas[userId].ingestaId,
        fecha: opts.fecha ?? JULIO,
        descripcion: crypto.encrypt(descripcion),
        cargo: opts.cargo ?? 5000n,
        abono: opts.abono ?? 0n,
        categoriaId:
          opts.categoriaId === undefined ? comidaA : opts.categoriaId,
        bucketId: BUCKET_IDS[Bucket.Deseos],
        clasificacionManual: opts.clasificacionManual ?? false,
      },
    });

  const leer = (id: string) =>
    prisma.transaccion.findUniqueOrThrow({
      where: { id },
      select: { categoriaId: true, bucketId: true, clasificacionManual: true },
    });

  it('S4: saving with moverDelPeriodo moves only the coinciding rows of that month, atomically', async () => {
    const coincide = await crearTx(USER_A, 'COMPRA ZQXSHOP 1234');
    const manual = await crearTx(USER_A, 'ZQXSHOP MALL', {
      clasificacionManual: true,
    });
    const junio = await crearTx(USER_A, 'ZQXSHOP', { fecha: JUNIO });
    const ingreso = await crearTx(USER_A, 'ZQXSHOP REEMBOLSO', {
      cargo: 0n,
      abono: 5000n,
    });
    const otra = await crearTx(USER_A, 'OTRA COSA');
    const deB = await crearTx(USER_B, 'ZQXSHOP B', { categoriaId: null });

    const vista = await catalogo.vistaPreviaPatron.execute({
      userId: USER_A,
      categoriaId: supermercadoA,
      patron: 'zqxshop',
      periodo: '2026-07',
    });
    expect(vista.getValue().coincidencias.map((m) => m.id)).toEqual([
      coincide.id,
    ]);

    const r = await catalogo.crearPatron.execute({
      userId: USER_A,
      categoriaId: supermercadoA,
      patron: 'zqxshop',
      matchType: 'CONTAINS',
      moverDelPeriodo: '2026-07',
    });

    expect(r.isOk()).toBe(true);
    expect(r.getValue().movidos).toBe(1);
    expect(await leer(coincide.id)).toEqual({
      categoriaId: supermercadoA,
      bucketId: BUCKET_IDS[Bucket.Necesidades],
      clasificacionManual: false,
    });
    for (const quieto of [manual, junio, ingreso, otra]) {
      expect((await leer(quieto.id)).categoriaId).toBe(comidaA);
    }
    // RNF-SEC-006: user B's row is never touched.
    expect(await leer(deB.id)).toEqual({
      categoriaId: null,
      bucketId: BUCKET_IDS[Bucket.Deseos],
      clasificacionManual: false,
    });
    expect(
      await prisma.patronClasificacion.count({
        where: {
          userId: USER_A,
          patron: 'zqxshop',
          categoriaId: supermercadoA,
        },
      }),
    ).toBe(1);
  });

  it('S4: without moverDelPeriodo nothing moves ("solo se usa en las próximas cartolas")', async () => {
    const coincide = await crearTx(USER_A, 'COMPRA ZQXSHOP 1234');

    const r = await catalogo.crearPatron.execute({
      userId: USER_A,
      categoriaId: supermercadoA,
      patron: 'zqxshop',
      matchType: 'CONTAINS',
    });

    expect(r.getValue().movidos).toBe(0);
    expect((await leer(coincide.id)).categoriaId).toBe(comidaA);
  });

  it('ADR-004:49: a failure inside the transaction rolls every write back', async () => {
    const tx = await crearTx(USER_A, 'ZQXSHOP 1');
    const writer = new PrismaAprendizajeClasificacionWriter(prisma);

    // The manual reclassification succeeds, then the pattern step fails.
    const r = await writer.aplicar(USER_A, {
      categoriaId: supermercadoA,
      reclasificarTransaccionId: tx.id,
      patron: { tipo: 'mover', patronId: 'no-existe' },
      moverTransaccionIds: [tx.id],
    });

    expect(r.getError()).toBeInstanceOf(PatronNoEncontradoError);
    expect(await leer(tx.id)).toEqual({
      categoriaId: comidaA,
      bucketId: BUCKET_IDS[Bucket.Deseos],
      clasificacionManual: false,
    });
  });

  it("RNF-SEC-006: another user's ids are never written, even when sent", async () => {
    const deB = await crearTx(USER_B, 'ZQXSHOP B', { categoriaId: null });
    const writer = new PrismaAprendizajeClasificacionWriter(prisma);

    const r = await writer.aplicar(USER_A, {
      categoriaId: supermercadoA,
      patron: {
        tipo: 'crear',
        patron: 'zqxshop',
        matchType: 'CONTAINS',
        prioridad: 100,
      },
      moverTransaccionIds: [deB.id],
    });

    expect(r.getValue().movidos).toBe(0);
    expect((await leer(deB.id)).categoriaId).toBeNull();
    // A's own category id is useless to B: B cannot point a row at it.
    const deBconCatA = await writer.aplicar(USER_B, {
      categoriaId: supermercadoA,
      patron: {
        tipo: 'crear',
        patron: 'zqxotro',
        matchType: 'CONTAINS',
        prioridad: 100,
      },
      moverTransaccionIds: [deB.id],
    });
    expect(deBconCatA.isFail()).toBe(true);
    expect((await leer(deB.id)).categoriaId).toBeNull();
  });

  it('S5: moving a pattern keeps its id and creadoEn (CLA-12 tie-break)', async () => {
    const creado = await catalogo.crearPatron.execute({
      userId: USER_A,
      categoriaId: comidaA,
      patron: 'zqxcafé',
      matchType: 'CONTAINS',
    });
    const id = creado.getValue().patron.id;
    const antes = await prisma.patronClasificacion.findUniqueOrThrow({
      where: { id },
    });

    const duplicado = await catalogo.crearPatron.execute({
      userId: USER_A,
      categoriaId: supermercadoA,
      patron: 'ZQXCAFE',
      matchType: 'CONTAINS',
    });
    expect(duplicado.isFail()).toBe(true);

    const movido = await catalogo.actualizarPatron.execute({
      userId: USER_A,
      id,
      categoriaId: supermercadoA,
    });

    expect(movido.getValue()).toMatchObject({ id, categoriaId: supermercadoA });
    const despues = await prisma.patronClasificacion.findUniqueOrThrow({
      where: { id },
    });
    expect(despues.creadoEn).toEqual(antes.creadoEn);
  });
});
