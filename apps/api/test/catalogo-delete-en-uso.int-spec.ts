/**
 * catalogo-delete-en-uso.int-spec.ts — US-039 (Phase 3, CA-04).
 *
 * The money invariant: deleting an in-use category moves NO money between
 * buckets. Mirrors catalogo-rebucket.int-spec.ts (which proves the OPPOSITE
 * — that re-bucketing DOES move money) — this is the matched pair for "does
 * a catalog delete move money?".
 *
 * A bare `toEqual(antes)` alone would be satisfiable by two identically
 * broken/empty payloads, so this spec asserts CONCRETE BigInt-safe totals on
 * BOTH sides (before AND after), not just structural equality. The fixture
 * seeds one income row so `porcentajeBp`/`estadoGlobal` are non-null —
 * without it, `sinIngreso: true` nulls every percentage and the comparison
 * degenerates into comparing two nulls.
 *
 * Requires a real DB. Run via
 * `ALLOW_DESTRUCTIVE_DB=1 pnpm api test:integration catalogo-delete-en-uso`.
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
import { categoriaIdDe } from './helpers/categoria-fixture';

const ALLOW = process.env.ALLOW_DESTRUCTIVE_DB === '1';
const API_KEY = process.env.API_KEY ?? '';

const RUN_ID = `catalogo-delete-en-uso-int-${Date.now()}`;
const USER_ID = `cat-del-en-uso-${RUN_ID}`;

const NOW = new Date();
const CURRENT_YEAR = NOW.getUTCFullYear();
const CURRENT_MONTH = String(NOW.getUTCMonth() + 1).padStart(2, '0');
const CURRENT_PERIODO = `${CURRENT_YEAR}-${CURRENT_MONTH}`;
const MID_MONTH_DATE = new Date(Date.UTC(CURRENT_YEAR, NOW.getUTCMonth(), 10));

describe('Deleting an in-use category moves no money (CAT038-04, CA-04) — /api/resumen identical before/after', () => {
  let app: Express;
  let prisma: PrismaClient;
  let auth: string;
  let deliveryId: string;
  let accountId: string;
  let ingestaId: string;
  let txId1: string;
  let txId2: string;

  beforeAll(async () => {
    if (!ALLOW) return;

    const env = loadEnv();
    prisma = createPrismaClient(env);
    await prisma.$connect();
    app = createApp(createContainer(env, prisma), env);
    // GET /api/resumen decrypts descripcion (ADR-013, US-036 fail-loud) with
    // the app's RUNTIME key — same instance app.ts's own container derives,
    // so seeded rows must be encrypted with it too.
    const crypto = new AesGcmCryptoService(
      Buffer.from(env.ENCRYPTION_KEY, 'base64'),
    );

    await prisma.user.create({
      data: { id: USER_ID, nombre: `Delete En Uso ${RUN_ID}` },
    });
    await crearCatalogoParaUsuario(prisma, USER_ID);
    deliveryId = await categoriaIdDe(prisma, {
      userId: USER_ID,
      bucket: Bucket.Deseos,
      nombre: 'Delivery',
    });

    const account = await prisma.account.create({
      data: {
        userId: USER_ID,
        banco: 'TestBank',
        tipoCuenta: 'CuentaCorriente',
        numeroCuenta: crypto.encrypt(`delete-en-uso-${RUN_ID}`),
      },
    });
    accountId = account.id;
    const ingesta = await prisma.ingesta.create({
      data: {
        userId: USER_ID,
        accountId,
        banco: 'TestBank',
        nombreArchivo: `delete-en-uso-${RUN_ID}.xlsx`,
        estado: 'PROCESADA',
      },
    });
    ingestaId = ingesta.id;

    // Categorized into Delivery/Deseos, as if categorization already ran.
    const [tx1, tx2] = await Promise.all([
      prisma.transaccion.create({
        data: {
          accountId,
          ingestaId,
          fecha: MID_MONTH_DATE,
          cargo: 15000n,
          abono: 0n,
          descripcion: crypto.encrypt('Uber Eats'),
          categoriaId: deliveryId,
          bucketId: BUCKET_IDS[Bucket.Deseos],
        },
      }),
      prisma.transaccion.create({
        data: {
          accountId,
          ingestaId,
          fecha: MID_MONTH_DATE,
          cargo: 8000n,
          abono: 0n,
          descripcion: crypto.encrypt('Rappi'),
          categoriaId: deliveryId,
          bucketId: BUCKET_IDS[Bucket.Deseos],
        },
      }),
    ]);
    txId1 = tx1.id;
    txId2 = tx2.id;

    // One income row so porcentajeBp/estadoGlobal are non-null — without
    // this, sinIngreso: true nulls every percentage and the CA-04 assertion
    // degenerates into comparing two nulls (design.md §6.4).
    await prisma.transaccion.create({
      data: {
        accountId,
        ingestaId,
        fecha: MID_MONTH_DATE,
        cargo: 0n,
        abono: 100000n,
        descripcion: crypto.encrypt('Sueldo'),
        bucketId: BUCKET_IDS[Bucket.Ingreso],
      },
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

  it('before/delete/after: the resumen is byte-identical, and both sides carry the SAME concrete BigInt totals — not two empty payloads', async () => {
    if (!ALLOW) return;

    // 1. before — concrete values, not just shape.
    const before = await request(app)
      .get(`/api/resumen?periodo=${CURRENT_PERIODO}`)
      .set('x-api-key', API_KEY)
      .set('Authorization', auth)
      .expect(200);
    const antes = before.body;
    const deseosAntes = antes.buckets.find(
      (b: { bucket: string }) => b.bucket === 'Deseos',
    );
    expect(deseosAntes.total).toBe('23000');
    expect(typeof deseosAntes.porcentajeBp).toBe('number');
    expect(antes.estadoGlobal).not.toBeNull();
    expect(typeof antes.estadoGlobal).toBe('string');

    // 2. delete — the in-use delete that US-038 refused (US-039, CAT038-04).
    await request(app)
      .delete(`/api/categorias/${deliveryId}`)
      .set('x-api-key', API_KEY)
      .set('Authorization', auth)
      .expect(204);

    const tx1Row = await prisma.transaccion.findUniqueOrThrow({
      where: { id: txId1 },
    });
    const tx2Row = await prisma.transaccion.findUniqueOrThrow({
      where: { id: txId2 },
    });
    expect(tx1Row.categoriaId).toBeNull();
    expect(tx1Row.bucketId).toBe(BUCKET_IDS[Bucket.Deseos]);
    expect(tx2Row.categoriaId).toBeNull();
    expect(tx2Row.bucketId).toBe(BUCKET_IDS[Bucket.Deseos]);

    // 3. after — structurally identical AND the same concrete values re-
    // asserted. A bare deep-equal alone is satisfiable by two identically
    // broken/empty payloads (design.md §6.4) — the point is that neither
    // side is broken.
    const after = await request(app)
      .get(`/api/resumen?periodo=${CURRENT_PERIODO}`)
      .set('x-api-key', API_KEY)
      .set('Authorization', auth)
      .expect(200);
    const despues = after.body;
    expect(despues).toEqual(antes);

    const deseosDespues = despues.buckets.find(
      (b: { bucket: string }) => b.bucket === 'Deseos',
    );
    expect(deseosDespues.total).toBe('23000');
    expect(deseosDespues.porcentajeBp).toBe(deseosAntes.porcentajeBp);
    expect(despues.estadoGlobal).toBe(antes.estadoGlobal);
  });
});
