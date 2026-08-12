/**
 * catalogo-rebucket.int-spec.ts — US-038 (Phase 12.5, CAT038-03, D-07).
 *
 * Bucket integrity end-to-end: categorize transactions into "Delivery"
 * (Deseos, per the seed template), re-bucket the category to Necesidades
 * via `PATCH /api/categorias/:id`, then assert BOTH `/api/resumen` and the
 * bucket drill-down (`/api/buckets/:bucket`) report the new bucket for
 * those historical rows — the atomic re-stamp (D-07) proven through the
 * read paths that actually matter to the user.
 *
 * Requires a real DB. Run via
 * `ALLOW_DESTRUCTIVE_DB=1 pnpm api test:integration catalogo-rebucket`.
 */
import 'dotenv/config';
import request from 'supertest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createApp } from '../src/infrastructure/http-express/app';
import { createContainer } from '../src/composition/container';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';
import { loadEnv } from '../src/config/env';
import { crearCatalogoParaUsuario } from './support/catalogo.fixture';
import { crearSesionParaUsuario } from './support/session.fixture';
import { BUCKET_IDS } from '../src/infrastructure/persistence/bucket-ids';
import { Bucket } from '../src/domain/value-objects/bucket';
import { AesGcmCryptoService } from '../src/infrastructure/persistence/aes-gcm-crypto.service';

const ALLOW = process.env.ALLOW_DESTRUCTIVE_DB === '1';
const API_KEY = process.env.API_KEY ?? '';

const RUN_ID = `catalogo-rebucket-int-${Date.now()}`;
const USER_ID = `cat-rebucket-${RUN_ID}`;

const NOW = new Date();
const CURRENT_YEAR = NOW.getUTCFullYear();
const CURRENT_MONTH = String(NOW.getUTCMonth() + 1).padStart(2, '0');
const CURRENT_PERIODO = `${CURRENT_YEAR}-${CURRENT_MONTH}`;
const MID_MONTH_DATE = new Date(Date.UTC(CURRENT_YEAR, NOW.getUTCMonth(), 10));

describe('Catalog re-bucket integrity (CAT038-03, D-07) — /api/resumen + bucket drill-down agree', () => {
  let app: Express;
  let prisma: PrismaClient;
  let auth: string;
  let categoriaId: string;
  let accountId: string;
  let ingestaId: string;

  beforeAll(async () => {
    if (!ALLOW) return;

    const env = loadEnv();
    prisma = createPrismaClient(env);
    await prisma.$connect();
    app = createApp(createContainer(env, prisma), env);
    // GET /api/buckets/:bucket decrypts descripcion/numeroCuenta (ADR-013,
    // US-036 fail-loud) with the app's RUNTIME key — same instance app.ts's
    // own container derives, so seeded rows must be encrypted with it too.
    const crypto = new AesGcmCryptoService(
      Buffer.from(env.ENCRYPTION_KEY, 'base64'),
    );

    await prisma.user.create({
      data: { id: USER_ID, nombre: `Rebucket ${RUN_ID}` },
    });
    await crearCatalogoParaUsuario(prisma, USER_ID);
    const delivery = await prisma.categoria.findUniqueOrThrow({
      where: { userId_nombre: { userId: USER_ID, nombre: 'Delivery' } },
    });
    categoriaId = delivery.id;

    const account = await prisma.account.create({
      data: {
        userId: USER_ID,
        banco: 'TestBank',
        tipoCuenta: 'CuentaCorriente',
        numeroCuenta: crypto.encrypt(`rebucket-${RUN_ID}`),
      },
    });
    accountId = account.id;
    const ingesta = await prisma.ingesta.create({
      data: {
        userId: USER_ID,
        accountId,
        banco: 'TestBank',
        nombreArchivo: `rebucket-${RUN_ID}.xlsx`,
        estado: 'PROCESADA',
      },
    });
    ingestaId = ingesta.id;

    // Categorized into Delivery/Deseos, as if categorization already ran.
    await prisma.transaccion.createMany({
      data: [
        {
          accountId,
          ingestaId,
          fecha: MID_MONTH_DATE,
          cargo: 15000n,
          abono: 0n,
          descripcion: crypto.encrypt('Uber Eats'),
          categoriaId,
          bucketId: BUCKET_IDS[Bucket.Deseos],
        },
        {
          accountId,
          ingestaId,
          fecha: MID_MONTH_DATE,
          cargo: 8000n,
          abono: 0n,
          descripcion: crypto.encrypt('Rappi'),
          categoriaId,
          bucketId: BUCKET_IDS[Bucket.Deseos],
        },
      ],
    });

    const { token } = await crearSesionParaUsuario(prisma, USER_ID);
    auth = `Bearer ${token}`;
  });

  afterAll(async () => {
    if (!ALLOW) return;

    await prisma.transaccion.deleteMany({ where: { ingestaId } });
    await prisma.ingesta.deleteMany({ where: { id: ingestaId } });
    await prisma.account.deleteMany({ where: { id: accountId } });
    await prisma.patronClasificacion.deleteMany({ where: { userId: USER_ID } });
    await prisma.categoria.deleteMany({ where: { userId: USER_ID } });
    await prisma.session.deleteMany({ where: { userId: USER_ID } });
    await prisma.user.deleteMany({ where: { id: USER_ID } });
    await prisma.$disconnect();
  });

  it('before re-bucket: /api/resumen and the drill-down both report the rows under Deseos', async () => {
    if (!ALLOW) return;

    const resumen = await request(app)
      .get(`/api/resumen?periodo=${CURRENT_PERIODO}`)
      .set('x-api-key', API_KEY)
      .set('Authorization', auth)
      .expect(200);
    const deseos = resumen.body.buckets.find(
      (b: { bucket: string }) => b.bucket === 'Deseos',
    );
    expect(deseos.total).toBe('23000');

    const drillDown = await request(app)
      .get(`/api/buckets/Deseos?periodo=${CURRENT_PERIODO}`)
      .set('x-api-key', API_KEY)
      .set('Authorization', auth)
      .expect(200);
    expect(drillDown.body.transacciones).toHaveLength(2);
  });

  it('re-bucket Delivery to Necesidades via PATCH /api/categorias/:id', async () => {
    if (!ALLOW) return;

    const res = await request(app)
      .patch(`/api/categorias/${categoriaId}`)
      .set('x-api-key', API_KEY)
      .set('Authorization', auth)
      .send({ bucket: 'Necesidades' })
      .expect(200);
    expect(res.body.bucket).toBe('Necesidades');
  });

  it('after re-bucket: BOTH /api/resumen AND the bucket drill-down report the historical rows under Necesidades, never Deseos', async () => {
    if (!ALLOW) return;

    const resumen = await request(app)
      .get(`/api/resumen?periodo=${CURRENT_PERIODO}`)
      .set('x-api-key', API_KEY)
      .set('Authorization', auth)
      .expect(200);
    const necesidades = resumen.body.buckets.find(
      (b: { bucket: string }) => b.bucket === 'Necesidades',
    );
    const deseos = resumen.body.buckets.find(
      (b: { bucket: string }) => b.bucket === 'Deseos',
    );
    expect(necesidades.total).toBe('23000');
    expect(deseos.total).toBe('0');

    const drillDownNecesidades = await request(app)
      .get(`/api/buckets/Necesidades?periodo=${CURRENT_PERIODO}`)
      .set('x-api-key', API_KEY)
      .set('Authorization', auth)
      .expect(200);
    expect(drillDownNecesidades.body.transacciones).toHaveLength(2);
    for (const tx of drillDownNecesidades.body.transacciones) {
      expect(tx.categoria).toEqual({ id: categoriaId, nombre: 'Delivery' });
    }

    const drillDownDeseos = await request(app)
      .get(`/api/buckets/Deseos?periodo=${CURRENT_PERIODO}`)
      .set('x-api-key', API_KEY)
      .set('Authorization', auth)
      .expect(200);
    expect(drillDownDeseos.body.transacciones).toHaveLength(0);
  });
});
