/**
 * eliminar-movimiento-manual.int-spec.ts — correccion-movimientos-manuales
 * (ADR-040), design.md D-05.
 *
 * Integration tests for DELETE /api/movimientos/:id. Fixture strategy
 * mirrors `registro-manual.int-spec.ts` / `ingesta-demo-gate.int-spec.ts`
 * (full HTTP stack: createApp + createContainer + supertest + x-api-key +
 * `crearSesionParaUsuario`) — NOT the repository-only shape of
 * `eliminar-ingesta.int-spec.ts`, because DEL-02 asserts response-body
 * BYTE-IDENTITY across three distinct cases, and DEL-03 needs the real
 * session path, neither observable at the repository level.
 *
 * A mocked Prisma (see `prisma-eliminar-movimiento-manual.repository.spec.ts`)
 * proves the WHERE clause we wrote; only a real DB proves the not-owned and
 * not-manual rows SURVIVE (DEL-05).
 *
 * Requires a real DB. Run via
 * `ALLOW_DESTRUCTIVE_DB=1 pnpm api test:integration -- eliminar-movimiento-manual`.
 */
import 'dotenv/config';
import request from 'supertest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createApp } from '../src/infrastructure/http-express/app';
import { createContainer } from '../src/composition/container';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';
import { loadEnv } from '../src/config/env';
import { crearSesionParaUsuario } from './support/session.fixture';
import { BUCKET_IDS } from '../src/infrastructure/persistence/bucket-ids';
import { Bucket } from '../src/domain/value-objects/bucket';

const ALLOW = process.env.ALLOW_DESTRUCTIVE_DB === '1';
const API_KEY = process.env.API_KEY ?? '';

const RUN_ID = `elim-mov-manual-int-${Date.now()}`;

/** Current UTC period as YYYY-MM. */
function currentPeriodo(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// DEL-01 / DEL-03 — happy path (204, row gone, resumen reflects) + demo gate
// ---------------------------------------------------------------------------

describe('DEL-01 / DEL-03 — happy path (204, row gone, resumen reflects) and demo gate (403, untouched)', () => {
  let app: Express;
  let prisma: PrismaClient;
  let auth: string;
  let authDemo: string;
  let userId: string;
  let demoUserId: string;
  let sentinelAccountId: string;
  let sentinelAccountIdDemo: string;
  let manualTxId: string;
  let demoManualTxId: string;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    if (!ALLOW) return;

    const env = loadEnv();
    prisma = createPrismaClient(env);
    await prisma.$connect();
    app = createApp(createContainer(env, prisma), env);

    userId = `${RUN_ID}-happy`;
    demoUserId = `${RUN_ID}-demo`;
    createdUserIds.push(userId, demoUserId);

    await prisma.user.create({ data: { id: userId, nombre: 'Happy Path' } });
    await prisma.user.create({
      data: { id: demoUserId, nombre: 'Demo Gate', esDemo: true },
    });

    const sentinelAccount = await prisma.account.create({
      data: {
        userId,
        banco: 'Manual',
        tipoCuenta: 'Manual',
        numeroCuenta: `manual-${RUN_ID}`,
      },
    });
    sentinelAccountId = sentinelAccount.id;

    const sentinelAccountDemo = await prisma.account.create({
      data: {
        userId: demoUserId,
        banco: 'Manual',
        tipoCuenta: 'Manual',
        numeroCuenta: `manual-demo-${RUN_ID}`,
      },
    });
    sentinelAccountIdDemo = sentinelAccountDemo.id;

    const manualTx = await prisma.transaccion.create({
      data: {
        accountId: sentinelAccountId,
        ingestaId: null,
        origen: 'Manual',
        bucketId: BUCKET_IDS[Bucket.Ingreso],
        cargo: 0n,
        abono: 45000n,
        fecha: new Date(),
        descripcion: 'Reembolso manual — happy path',
      },
    });
    manualTxId = manualTx.id;

    const demoManualTx = await prisma.transaccion.create({
      data: {
        accountId: sentinelAccountIdDemo,
        ingestaId: null,
        origen: 'Manual',
        bucketId: BUCKET_IDS[Bucket.Ingreso],
        cargo: 0n,
        abono: 15000n,
        fecha: new Date(),
        descripcion: 'Reembolso manual — demo',
      },
    });
    demoManualTxId = demoManualTx.id;

    const session = await crearSesionParaUsuario(prisma, userId);
    auth = `Bearer ${session.token}`;
    const sessionDemo = await crearSesionParaUsuario(prisma, demoUserId);
    authDemo = `Bearer ${sessionDemo.token}`;
  });

  afterAll(async () => {
    if (!ALLOW) return;
    for (const uid of createdUserIds) {
      await prisma.transaccion.deleteMany({
        where: { account: { userId: uid } },
      });
      await prisma.account.deleteMany({ where: { userId: uid } });
      await prisma.session.deleteMany({ where: { userId: uid } });
    }
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  it('DEL-01: DELETE own manual movement → 204, row gone', async () => {
    if (!ALLOW) return;

    await request(app)
      .delete(`/api/movimientos/${manualTxId}`)
      .set('x-api-key', API_KEY)
      .set('Authorization', auth)
      .expect(204);

    const tx = await prisma.transaccion.findUnique({
      where: { id: manualTxId },
    });
    expect(tx).toBeNull();
  });

  it('DEL-01: GET /api/resumen reflects the removal — deleted amount no longer counted', async () => {
    if (!ALLOW) return;

    const periodo = currentPeriodo();
    const res = await request(app)
      .get(`/api/resumen?periodo=${periodo}`)
      .set('x-api-key', API_KEY)
      .set('Authorization', auth)
      .expect(200);

    // The deleted row was the ONLY transaction for this fresh user — resumen
    // must show no income, no residual amount from the deleted row.
    expect(res.body.totalIngreso).toBe('0');
  });

  it('DEL-03: demo session → 403 DEMO_SOLO_LECTURA, row untouched', async () => {
    if (!ALLOW) return;

    const res = await request(app)
      .delete(`/api/movimientos/${demoManualTxId}`)
      .set('x-api-key', API_KEY)
      .set('Authorization', authDemo);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('DEMO_SOLO_LECTURA');

    const tx = await prisma.transaccion.findUnique({
      where: { id: demoManualTxId },
    });
    expect(tx).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// DEL-02 / DEL-05 — merged 404 anti-enumeration (cross-user, not-manual,
// absent, repeat) with byte-identical bodies
// ---------------------------------------------------------------------------

describe('DEL-02 / DEL-05 — merged 404 anti-enumeration (cross-user, not-manual, absent, repeat) — byte-identical bodies', () => {
  let app: Express;
  let prisma: PrismaClient;
  let authA: string;
  let userIdA: string;
  let userIdB: string;
  let victimTxId: string;
  let ingestaTxId: string;
  let ingestaId: string;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    if (!ALLOW) return;

    const env = loadEnv();
    prisma = createPrismaClient(env);
    await prisma.$connect();
    app = createApp(createContainer(env, prisma), env);

    userIdA = `${RUN_ID}-a`;
    userIdB = `${RUN_ID}-b`;
    createdUserIds.push(userIdA, userIdB);

    await prisma.user.create({ data: { id: userIdA, nombre: 'User A' } });
    await prisma.user.create({ data: { id: userIdB, nombre: 'User B' } });

    // User A's own manual account + an ingesta-born account/ingesta/tx, to
    // prove the not-manual negative.
    const accountA = await prisma.account.create({
      data: {
        userId: userIdA,
        banco: 'BCI',
        tipoCuenta: 'Cuenta Corriente',
        numeroCuenta: `bci-${RUN_ID}-a`,
      },
    });

    const ingesta = await prisma.ingesta.create({
      data: {
        userId: userIdA,
        accountId: accountA.id,
        banco: 'BCI',
        nombreArchivo: `ingesta-${RUN_ID}.xlsx`,
        estado: 'PROCESADA',
        totalTransacciones: 1,
      },
    });
    ingestaId = ingesta.id;

    const ingestaTx = await prisma.transaccion.create({
      data: {
        accountId: accountA.id,
        ingestaId: ingesta.id,
        origen: null,
        bucketId: BUCKET_IDS[Bucket.Necesidades],
        cargo: 5000n,
        abono: 0n,
        fecha: new Date(),
        descripcion: 'Ingesta-born tx — not-manual negative',
      },
    });
    ingestaTxId = ingestaTx.id;

    // User B's own manual movement — the cross-user victim.
    const sentinelB = await prisma.account.create({
      data: {
        userId: userIdB,
        banco: 'Manual',
        tipoCuenta: 'Manual',
        numeroCuenta: `manual-${RUN_ID}-b`,
      },
    });

    const victimTx = await prisma.transaccion.create({
      data: {
        accountId: sentinelB.id,
        ingestaId: null,
        origen: 'Manual',
        bucketId: BUCKET_IDS[Bucket.Ingreso],
        cargo: 0n,
        abono: 30000n,
        fecha: new Date(),
        descripcion: 'User B manual — cross-user victim',
      },
    });
    victimTxId = victimTx.id;

    const session = await crearSesionParaUsuario(prisma, userIdA);
    authA = `Bearer ${session.token}`;
  });

  afterAll(async () => {
    if (!ALLOW) return;
    for (const uid of createdUserIds) {
      await prisma.transaccion.deleteMany({
        where: { account: { userId: uid } },
      });
      await prisma.ingesta.deleteMany({ where: { userId: uid } });
      await prisma.account.deleteMany({ where: { userId: uid } });
      await prisma.session.deleteMany({ where: { userId: uid } });
    }
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  it('DEL-05: cross-user delete attempt → 404, victim row survives', async () => {
    if (!ALLOW) return;

    const res = await request(app)
      .delete(`/api/movimientos/${victimTxId}`)
      .set('x-api-key', API_KEY)
      .set('Authorization', authA);

    expect(res.status).toBe(404);

    const tx = await prisma.transaccion.findUnique({
      where: { id: victimTxId },
    });
    expect(tx).not.toBeNull();
  });

  it('DEL-05: own ingesta-born row delete attempt → 404, row survives', async () => {
    if (!ALLOW) return;

    const res = await request(app)
      .delete(`/api/movimientos/${ingestaTxId}`)
      .set('x-api-key', API_KEY)
      .set('Authorization', authA);

    expect(res.status).toBe(404);

    const tx = await prisma.transaccion.findUnique({
      where: { id: ingestaTxId },
    });
    expect(tx).not.toBeNull();
    expect(tx!.ingestaId).toBe(ingestaId);
  });

  it('DEL-02: absent id → 404', async () => {
    if (!ALLOW) return;

    const res = await request(app)
      .delete(`/api/movimientos/${RUN_ID}-does-not-exist`)
      .set('x-api-key', API_KEY)
      .set('Authorization', authA);

    expect(res.status).toBe(404);
  });

  it('DEL-02: idempotence — deleting an EXISTING row succeeds once (204) and the repeat → 404 (verify hardening: the literal spec scenario, not two absent-id deletes)', async () => {
    if (!ALLOW) return;

    // A real row for user A, created and destroyed within this test: the
    // spec's idempotence wording is "delete an existing movement, then the
    // same id again" — an absent-id-twice variant is behaviorally
    // equivalent (deleteMany count===0 either way) but not faithful.
    const sentinelA = await prisma.account.create({
      data: {
        userId: userIdA,
        banco: 'Manual',
        tipoCuenta: 'Manual',
        numeroCuenta: `manual-${RUN_ID}-a-idem`,
      },
    });
    const propia = await prisma.transaccion.create({
      data: {
        accountId: sentinelA.id,
        ingestaId: null,
        origen: 'Manual',
        bucketId: BUCKET_IDS[Bucket.Necesidades],
        cargo: 1200n,
        abono: 0n,
        fecha: new Date(),
        descripcion: 'User A manual — idempotence subject',
      },
    });

    await request(app)
      .delete(`/api/movimientos/${propia.id}`)
      .set('x-api-key', API_KEY)
      .set('Authorization', authA)
      .expect(204);

    const res = await request(app)
      .delete(`/api/movimientos/${propia.id}`)
      .set('x-api-key', API_KEY)
      .set('Authorization', authA);

    expect(res.status).toBe(404);
  });

  it('DEL-02: all three 404 bodies (cross-user, not-manual, absent) are byte-identical', async () => {
    if (!ALLOW) return;

    const [crossUser, notManual, absent] = await Promise.all([
      request(app)
        .delete(`/api/movimientos/${victimTxId}`)
        .set('x-api-key', API_KEY)
        .set('Authorization', authA),
      request(app)
        .delete(`/api/movimientos/${ingestaTxId}`)
        .set('x-api-key', API_KEY)
        .set('Authorization', authA),
      request(app)
        .delete(`/api/movimientos/${RUN_ID}-absent-for-byte-check`)
        .set('x-api-key', API_KEY)
        .set('Authorization', authA),
    ]);

    expect(crossUser.status).toBe(404);
    expect(notManual.status).toBe(404);
    expect(absent.status).toBe(404);

    const bodyCrossUser = JSON.stringify(crossUser.body);
    const bodyNotManual = JSON.stringify(notManual.body);
    const bodyAbsent = JSON.stringify(absent.body);

    expect(bodyCrossUser).toBe(bodyNotManual);
    expect(bodyNotManual).toBe(bodyAbsent);
  });
});
