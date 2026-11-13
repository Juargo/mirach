/**
 * Merge of an anonymous account into an existing account (ADR-014) against a
 * real DB: the real constraints (RESTRICT, SET NULL, the composite pattern FK,
 * the row locks, the blind index) are what the unit suites cannot prove.
 *
 * Requires a real DB. Run via `pnpm api test:integration`.
 */
import request from 'supertest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createApp } from '../src/infrastructure/http-express/app';
import { createContainer } from '../src/composition/container';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';
import { loadEnv } from '../src/config/env';
import { IpRateLimiter } from '../src/infrastructure/http/auth/ip-rate-limiter';
import { Sha256SessionTokenService } from '../src/infrastructure/http/auth/sha256-session-token.service';
import { AesGcmCryptoService } from '../src/infrastructure/persistence/aes-gcm-crypto.service';
import { HmacBlindIndexService } from '../src/infrastructure/persistence/hmac-blind-index.service';
import { deriveBlindIndexKey } from '../src/composition/derive-blind-index-key';
import {
  CATEGORIA_TEMPLATE_SIZE,
  copiarCatalogoTemplate,
} from '../src/infrastructure/persistence/catalogo-template';
import { Bucket } from '../src/domain/value-objects/bucket';
import { BUCKET_IDS } from '../src/infrastructure/persistence/bucket-ids';
import { categoriaIdDe } from './helpers/categoria-fixture';

const ALLOW = process.env.ALLOW_DESTRUCTIVE_DB === '1';
const API_KEY = process.env.API_KEY ?? '';
const RUN_ID = `fusion-cuentas-int-${Date.now()}`;
const DIA_MS = 24 * 60 * 60 * 1000;
const FECHA = new Date('2026-10-12T00:00:00.000Z');

describe.skipIf(!ALLOW)('Account merge (int, ADR-014)', () => {
  let prisma: PrismaClient;
  let app: Express;
  let crypto: AesGcmCryptoService;
  let blindIndex: HmacBlindIndexService;
  const tokens = new Sha256SessionTokenService();
  const createdUserIds: string[] = [];
  let secuencia = 0;

  beforeAll(async () => {
    const env = loadEnv();
    prisma = createPrismaClient(env);
    await prisma.$connect();
    const clave = Buffer.from(env.ENCRYPTION_KEY, 'base64');
    crypto = new AesGcmCryptoService(clave);
    blindIndex = new HmacBlindIndexService(deriveBlindIndexKey(clave));

    const base = createContainer(env, prisma);
    const sinLimite = (prefijo: string) =>
      new IpRateLimiter(`${prefijo}:${RUN_ID}:`, 1000, 900_000);
    app = createApp(
      {
        ...base,
        altaAnonimaRateLimiter: sinLimite('alta'),
        fusionarRateLimiter: sinLimite('fusionar'),
      },
      env,
    );
  });

  afterAll(async () => {
    const userId = { in: createdUserIds };
    await prisma.transaccion.deleteMany({ where: { account: { userId } } });
    await prisma.ingesta.deleteMany({ where: { userId } });
    await prisma.patronClasificacion.deleteMany({ where: { userId } });
    await prisma.categoria.deleteMany({ where: { userId } });
    await prisma.account.deleteMany({ where: { userId } });
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.consentimiento.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  // ── Fixtures ────────────────────────────────────────────────────────────

  async function altaAnonima(): Promise<{ token: string; userId: string }> {
    const res = await request(app)
      .post('/api/auth/anonimo')
      .set('x-api-key', API_KEY)
      .send({ versionTerminos: '1.0', versionPrivacidad: '1.0' });

    expect(res.status).toBe(200);
    createdUserIds.push(res.body.userId);
    return res.body;
  }

  /** An ordinary account (it has a Google sub) with its own catalog and session. */
  async function cuentaOrdinaria(): Promise<{ token: string; userId: string }> {
    const n = ++secuencia;
    const email = `${RUN_ID}-${n}@example.com`;
    const user = await prisma.user.create({
      data: {
        nombre: `Destino ${n}`,
        googleSub: `${RUN_ID}-sub-${n}`,
        email: crypto.encrypt(email),
        emailBlindIndex: blindIndex.compute(email),
        // The goals must match the declared profile (CHECK
        // User_perfil_predefinido_metas_check).
        perfilPresupuesto: '60_20_20',
        metaNecesidadesBp: 6000,
        metaDeseosBp: 2000,
        metaAhorroBp: 2000,
        diaCorte: 15,
        ingresoDeclarado: 900000n,
      },
    });
    createdUserIds.push(user.id);
    await copiarCatalogoTemplate(prisma, user.id);
    await prisma.consentimiento.create({
      data: { userId: user.id, tipo: 'terminos', version: 'destino-v1' },
    });
    const { token, tokenHash } = tokens.generar();
    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 7 * DIA_MS),
      },
    });
    return { token, userId: user.id };
  }

  async function cuentaBancaria(
    userId: string,
    banco: string,
    tipoCuenta: string,
    numero: string,
  ): Promise<string> {
    const account = await prisma.account.create({
      data: {
        userId,
        banco,
        tipoCuenta,
        numeroCuenta: crypto.encrypt(numero),
        numeroCuentaBlindIndex: blindIndex.compute(numero),
      },
    });
    return account.id;
  }

  async function movimiento(
    accountId: string,
    descripcion: string,
    over: {
      cargo?: bigint;
      categoriaId?: string;
      bucket?: Bucket;
      ingestaId?: string;
      clasificacionManual?: boolean;
    } = {},
  ): Promise<string> {
    const row = await prisma.transaccion.create({
      data: {
        accountId,
        fecha: FECHA,
        descripcion: crypto.encrypt(descripcion),
        cargo: over.cargo ?? 3500n,
        abono: 0n,
        categoriaId: over.categoriaId,
        bucketId:
          over.bucket === undefined ? undefined : BUCKET_IDS[over.bucket],
        ingestaId: over.ingestaId,
        origen: over.ingestaId === undefined ? 'Manual' : null,
        clasificacionManual: over.clasificacionManual ?? false,
      },
    });
    return row.id;
  }

  async function descripcionDe(id: string): Promise<string> {
    const row = await prisma.transaccion.findUniqueOrThrow({ where: { id } });
    return crypto.decrypt(row.descripcion);
  }

  function fusionar(token: string, tokenOrigen: unknown) {
    return request(app)
      .post('/api/cuenta/fusionar')
      .set('x-api-key', API_KEY)
      .set('Authorization', `Bearer ${token}`)
      .send({ tokenOrigen });
  }

  /** Every row of the given users, by id: what a rejected merge must not change. */
  async function huella(userIds: string[]) {
    const userId = { in: userIds };
    const ids = async (rows: Promise<Array<{ id: string }>>) =>
      (await rows).map((r) => r.id).sort();

    return {
      users: await prisma.user.findMany({
        where: { id: userId },
        orderBy: { id: 'asc' },
      }),
      cuentas: await ids(
        prisma.account.findMany({ where: { userId }, select: { id: true } }),
      ),
      movimientos: await ids(
        prisma.transaccion.findMany({
          where: { account: { userId } },
          select: { id: true },
        }),
      ),
      ingestas: await ids(
        prisma.ingesta.findMany({ where: { userId }, select: { id: true } }),
      ),
      categorias: await ids(
        prisma.categoria.findMany({ where: { userId }, select: { id: true } }),
      ),
      patrones: await ids(
        prisma.patronClasificacion.findMany({
          where: { userId },
          select: { id: true },
        }),
      ),
      sesiones: await ids(
        prisma.session.findMany({ where: { userId }, select: { id: true } }),
      ),
      consentimientos: await ids(
        prisma.consentimiento.findMany({
          where: { userId },
          select: { id: true },
        }),
      ),
    };
  }

  // ── The merge ───────────────────────────────────────────────────────────

  it('unites and moves accounts, drops duplicates, maps categories, drops duplicated patterns and removes the origin', async () => {
    const origen = await altaAnonima();
    const destino = await cuentaOrdinaria();
    const tercero = await altaAnonima();

    const ctaTercero = await cuentaBancaria(
      tercero.userId,
      'BCI',
      'corriente',
      '111',
    );
    await movimiento(ctaTercero, 'COPEC');
    const antesDelTercero = await huella([tercero.userId]);

    // Accounts: the origin's A1 unites with the destination's D1 (same bank,
    // type and number); A2 has no equivalent and moves.
    const d1 = await cuentaBancaria(destino.userId, 'BCI', 'corriente', '111');
    const a1 = await cuentaBancaria(origen.userId, 'BCI', 'corriente', '111');
    const a2 = await cuentaBancaria(origen.userId, 'Santander', 'vista', '222');

    const dSuper = await categoriaIdDe(prisma, {
      userId: destino.userId,
      bucket: Bucket.Necesidades,
      nombre: 'Supermercado',
    });
    const dCombustible = await categoriaIdDe(prisma, {
      userId: destino.userId,
      bucket: Bucket.Necesidades,
      nombre: 'Combustible',
    });
    const dFarmacia = await categoriaIdDe(prisma, {
      userId: destino.userId,
      bucket: Bucket.Necesidades,
      nombre: 'Farmacia',
    });
    const oSuper = await categoriaIdDe(prisma, {
      userId: origen.userId,
      bucket: Bucket.Necesidades,
      nombre: 'Supermercado',
    });
    const oCombustible = await categoriaIdDe(prisma, {
      userId: origen.userId,
      bucket: Bucket.Necesidades,
      nombre: 'Combustible',
    });
    const oFarmacia = await categoriaIdDe(prisma, {
      userId: origen.userId,
      bucket: Bucket.Necesidades,
      nombre: 'Farmacia',
    });
    // A custom category of the origin, with a pattern: it moves.
    const oMascotas = (
      await prisma.categoria.create({
        data: {
          userId: origen.userId,
          nombre: 'Mascotas',
          bucketId: BUCKET_IDS[Bucket.Deseos],
          icono: 'paw-print',
        },
      })
    ).id;
    const pMascotas = (
      await prisma.patronClasificacion.create({
        data: {
          userId: origen.userId,
          categoriaId: oMascotas,
          patron: `${RUN_ID}-guau`,
          matchType: 'CONTAINS',
          prioridad: 10,
        },
      })
    ).id;
    // Pattern texts: the destination has "Café-X"; the origin has "CAFE-X"
    // (same text once folded) and "tienda-x" (new, on a replaced category).
    const pDestinoCafe = (
      await prisma.patronClasificacion.create({
        data: {
          userId: destino.userId,
          categoriaId: dSuper,
          patron: `${RUN_ID}-Café-X`,
          matchType: 'CONTAINS',
          prioridad: 10,
        },
      })
    ).id;
    const pOrigenCafe = (
      await prisma.patronClasificacion.create({
        data: {
          userId: origen.userId,
          categoriaId: oSuper,
          patron: `${RUN_ID}-CAFE-X`,
          matchType: 'CONTAINS',
          prioridad: 10,
        },
      })
    ).id;
    const pTienda = (
      await prisma.patronClasificacion.create({
        data: {
          userId: origen.userId,
          categoriaId: oSuper,
          patron: `${RUN_ID}-tienda-x`,
          matchType: 'CONTAINS',
          prioridad: 10,
        },
      })
    ).id;

    // Movements.
    const ingesta = await prisma.ingesta.create({
      data: {
        userId: origen.userId,
        accountId: a1,
        banco: 'BCI',
        nombreArchivo: 'cartola.xlsx',
        estado: 'PROCESADA',
        totalTransacciones: 3,
        duplicadosOmitidos: 0,
      },
    });
    const mDestinoCopec = await movimiento(d1, 'COPEC', {
      categoriaId: dCombustible,
      bucket: Bucket.Necesidades,
    });
    // Same text as the destination's, encrypted with another random IV.
    const mDuplicado = await movimiento(a1, 'COPEC', {
      categoriaId: oCombustible,
      bucket: Bucket.Necesidades,
      ingestaId: ingesta.id,
    });
    const mLider = await movimiento(a1, 'LIDER', {
      cargo: 12000n,
      categoriaId: oSuper,
      bucket: Bucket.Necesidades,
      ingestaId: ingesta.id,
      clasificacionManual: true,
    });
    const mFido = await movimiento(a1, 'FIDO', {
      cargo: 8000n,
      categoriaId: oMascotas,
      bucket: Bucket.Deseos,
      ingestaId: ingesta.id,
    });
    const mFarmacia = await movimiento(a2, 'FARMACIA', {
      categoriaId: oFarmacia,
      bucket: Bucket.Necesidades,
    });

    const destinoAntes = await prisma.user.findUniqueOrThrow({
      where: { id: destino.userId },
    });
    const consentimientosAntes = await prisma.consentimiento.findMany({
      where: { userId: destino.userId },
      orderBy: { id: 'asc' },
    });
    const patronesDestinoAntes = await prisma.patronClasificacion.count({
      where: { userId: destino.userId },
    });

    const res = await fusionar(destino.token, origen.token);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      cuentasMovidas: 1,
      cuentasUnidas: 1,
      movimientosMovidos: 3,
      duplicadosOmitidos: 1,
      categoriasMovidas: 1,
      patronesMovidos: 2,
    });

    // (a) accounts: A1 united into D1, A2 moved.
    expect(await prisma.account.findUnique({ where: { id: a1 } })).toBeNull();
    const cuentaMovida = await prisma.account.findUniqueOrThrow({
      where: { id: a2 },
    });
    expect(cuentaMovida.userId).toBe(destino.userId);
    expect(
      await prisma.account.count({ where: { userId: destino.userId } }),
    ).toBe(2);

    // (b) movements: the duplicate is dropped, the others move keeping their data.
    expect(
      await prisma.transaccion.findUnique({ where: { id: mDuplicado } }),
    ).toBeNull();
    expect(
      await prisma.transaccion.findUnique({ where: { id: mDestinoCopec } }),
    ).not.toBeNull();
    expect(await prisma.transaccion.count({ where: { accountId: d1 } })).toBe(
      3,
    );

    const lider = await prisma.transaccion.findUniqueOrThrow({
      where: { id: mLider },
    });
    expect(lider).toMatchObject({
      accountId: d1,
      cargo: 12000n,
      bucketId: BUCKET_IDS[Bucket.Necesidades],
      clasificacionManual: true,
      ingestaId: ingesta.id,
      origen: null,
      // (d) classified in the origin's template category: it now points to the
      // DESTINATION's category of the same name.
      categoriaId: dSuper,
    });
    expect(await descripcionDe(mLider)).toBe('LIDER');
    expect(
      (await prisma.transaccion.findUniqueOrThrow({ where: { id: mFarmacia } }))
        .categoriaId,
    ).toBe(dFarmacia);

    // (d) a custom origin category moves, with its movement and its pattern.
    const mascotas = await prisma.categoria.findUniqueOrThrow({
      where: { id: oMascotas },
    });
    expect(mascotas).toMatchObject({
      userId: destino.userId,
      nombre: 'Mascotas',
      icono: 'paw-print',
    });
    expect(
      (await prisma.transaccion.findUniqueOrThrow({ where: { id: mFido } }))
        .categoriaId,
    ).toBe(oMascotas);
    expect(
      await prisma.patronClasificacion.findUniqueOrThrow({
        where: { id: pMascotas },
      }),
    ).toMatchObject({ userId: destino.userId, categoriaId: oMascotas });

    // (d) the origin's template categories are gone; the destination's stay
    // (with their own icon) plus the one that moved.
    expect(
      await prisma.categoria.count({ where: { userId: origen.userId } }),
    ).toBe(0);
    expect(
      await prisma.categoria.count({ where: { userId: destino.userId } }),
    ).toBe(CATEGORIA_TEMPLATE_SIZE + 1);
    expect(
      await prisma.categoria.findUnique({ where: { id: oCombustible } }),
    ).toBeNull();

    // (e) patterns: the folded duplicate is dropped, the new one is re-pointed
    // to the destination's category, and no pattern of the origin remains.
    expect(
      await prisma.patronClasificacion.findUnique({
        where: { id: pOrigenCafe },
      }),
    ).toBeNull();
    expect(
      await prisma.patronClasificacion.findUniqueOrThrow({
        where: { id: pDestinoCafe },
      }),
    ).toMatchObject({ userId: destino.userId, categoriaId: dSuper });
    expect(
      await prisma.patronClasificacion.findUniqueOrThrow({
        where: { id: pTienda },
      }),
    ).toMatchObject({ userId: destino.userId, categoriaId: dSuper });
    expect(
      await prisma.patronClasificacion.count({
        where: { userId: destino.userId },
      }),
    ).toBe(patronesDestinoAntes + 2);
    expect(
      await prisma.patronClasificacion.count({
        where: { userId: origen.userId },
      }),
    ).toBe(0);

    // (h) no movement of the destination points to a category of another user,
    // and none lost its category.
    expect(
      await prisma.transaccion.count({
        where: {
          account: { userId: destino.userId },
          OR: [
            { categoriaId: null },
            { categoria: { userId: { not: destino.userId } } },
          ],
        },
      }),
    ).toBe(0);

    // (c) the ingesta moved with the united account, totals untouched.
    expect(
      await prisma.ingesta.findUniqueOrThrow({ where: { id: ingesta.id } }),
    ).toMatchObject({
      userId: destino.userId,
      accountId: d1,
      totalTransacciones: 3,
      duplicadosOmitidos: 0,
    });

    // (f) the destination keeps its own settings and consents.
    expect(
      await prisma.user.findUniqueOrThrow({ where: { id: destino.userId } }),
    ).toEqual(destinoAntes);
    expect(
      await prisma.consentimiento.findMany({
        where: { userId: destino.userId },
        orderBy: { id: 'asc' },
      }),
    ).toEqual(consentimientosAntes);

    // (g) the origin user and sessions are gone, and its token no longer works.
    expect(
      await prisma.user.findUnique({ where: { id: origen.userId } }),
    ).toBeNull();
    expect(
      await prisma.session.count({ where: { userId: origen.userId } }),
    ).toBe(0);
    expect(
      await prisma.consentimiento.count({ where: { userId: origen.userId } }),
    ).toBe(0);
    const segunda = await fusionar(destino.token, origen.token);
    expect(segunda.status).toBe(409);
    expect(segunda.body.code).toBe('ORIGEN_INVALIDO');

    // (h) a third user is untouched.
    expect(await huella([tercero.userId])).toEqual(antesDelTercero);
  });

  it('a movement of a united account that is not a duplicate moves; duplicates count copies', async () => {
    const origen = await altaAnonima();
    const destino = await cuentaOrdinaria();
    const d1 = await cuentaBancaria(destino.userId, 'BCI', 'corriente', '555');
    const a1 = await cuentaBancaria(origen.userId, 'BCI', 'corriente', '555');
    await movimiento(d1, 'COPEC');
    await movimiento(d1, 'COPEC');
    await movimiento(a1, 'COPEC');
    await movimiento(a1, 'COPEC');
    await movimiento(a1, 'COPEC');

    const res = await fusionar(destino.token, origen.token);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      cuentasUnidas: 1,
      cuentasMovidas: 0,
      movimientosMovidos: 1,
      duplicadosOmitidos: 2,
    });
    expect(await prisma.transaccion.count({ where: { accountId: d1 } })).toBe(
      3,
    );
  });

  // ── Rejections write nothing ────────────────────────────────────────────

  describe('rejections write nothing', () => {
    async function conDatos() {
      const origen = await altaAnonima();
      const destino = await cuentaOrdinaria();
      const cuenta = await cuentaBancaria(
        origen.userId,
        'BCI',
        'corriente',
        `${RUN_ID}-rechazo-${++secuencia}`,
      );
      await movimiento(cuenta, 'COPEC');
      return { origen, destino };
    }

    it('an unknown origin token is 409 ORIGEN_INVALIDO, never 401', async () => {
      const { origen, destino } = await conDatos();
      const antes = await huella([origen.userId, destino.userId]);

      const res = await fusionar(destino.token, 'no-existe');

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('ORIGEN_INVALIDO');
      expect(await huella([origen.userId, destino.userId])).toEqual(antes);
    });

    it('an expired origin session is 409 ORIGEN_INVALIDO', async () => {
      const { origen, destino } = await conDatos();
      await prisma.session.updateMany({
        where: { userId: origen.userId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const antes = await huella([origen.userId, destino.userId]);

      const res = await fusionar(destino.token, origen.token);

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('ORIGEN_INVALIDO');
      expect(await huella([origen.userId, destino.userId])).toEqual(antes);
    });

    it('an origin that is not anonymous is 409 ORIGEN_INVALIDO', async () => {
      const ordinaria = await cuentaOrdinaria();
      const destino = await cuentaOrdinaria();
      const antes = await huella([ordinaria.userId, destino.userId]);

      const res = await fusionar(destino.token, ordinaria.token);

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('ORIGEN_INVALIDO');
      expect(await huella([ordinaria.userId, destino.userId])).toEqual(antes);
    });

    it('the origin being the destination itself is 409 ORIGEN_INVALIDO', async () => {
      const destino = await cuentaOrdinaria();
      const antes = await huella([destino.userId]);

      const res = await fusionar(destino.token, destino.token);

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('ORIGEN_INVALIDO');
      expect(await huella([destino.userId])).toEqual(antes);
    });

    it('an anonymous caller is 409 DESTINO_ANONIMO', async () => {
      const { origen } = await conDatos();
      const llamador = await altaAnonima();
      const antes = await huella([origen.userId, llamador.userId]);

      const res = await fusionar(llamador.token, origen.token);

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('DESTINO_ANONIMO');
      expect(await huella([origen.userId, llamador.userId])).toEqual(antes);
    });

    it.each([
      ['a missing body', undefined],
      ['a non-string token', 42],
      ['an empty token', ''],
    ])('%s is 400 BODY_INVALIDO', async (_caso, tokenOrigen) => {
      const { origen, destino } = await conDatos();
      const antes = await huella([origen.userId, destino.userId]);

      const res = await fusionar(destino.token, tokenOrigen);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('BODY_INVALIDO');
      expect(await huella([origen.userId, destino.userId])).toEqual(antes);
    });
  });
});
