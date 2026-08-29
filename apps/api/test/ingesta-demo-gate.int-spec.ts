/**
 * ingesta-demo-gate.int-spec.ts — issue #500. Scaffolded from
 * `catalogo-demo-gate.int-spec.ts`/`perfil-demo-gate.int-spec.ts`.
 *
 * All 3 gated ingesta write surfaces from a demo (`esDemo: true`) session
 * MUST return 403 with `code: "DEMO_SOLO_LECTURA"`, and MUST mutate
 * nothing — no `Ingesta` row created (including no `FALLIDA` row) for the
 * 2 upload surfaces, and the pre-existing ingesta survives untouched for
 * DELETE. `GET /api/ingestas` MUST remain available (200) to that same
 * demo session (read-only stays read-only, PRODUCT.md principle 4).
 * `POST /api/ingestas/preview` is intentionally NOT covered here — it is a
 * genuine dry-run (no writer port injected, `PreviewIngestaUseCase`'s own
 * CA-04), so it never gated and does not need to.
 *
 * Requires a real DB. Run via
 * `ALLOW_DESTRUCTIVE_DB=1 pnpm api test:integration -- ingesta-demo-gate`.
 */
import 'dotenv/config';
import { join } from 'path';
import request from 'supertest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createApp } from '../src/infrastructure/http-express/app';
import { createContainer } from '../src/composition/container';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';
import { loadEnv } from '../src/config/env';
import { crearSesionParaUsuario } from './support/session.fixture';

const ALLOW = process.env.ALLOW_DESTRUCTIVE_DB === '1';
const API_KEY = process.env.API_KEY ?? '';

const RUN_ID = `ingesta-demo-gate-int-${Date.now()}`;
const DEMO_USER_ID = `ingesta-demo-${RUN_ID}`;

const xlsxFixture = join(__dirname, 'fixtures', 'movimientos-test.xlsx');

describe('Ingesta demo gate (issue #500) — all 3 write surfaces rejected, GET still allowed, nothing mutated', () => {
  let app: Express;
  let prisma: PrismaClient;
  let authDemo: string;
  let accountId: string;
  let ingestaId: string;

  beforeAll(async () => {
    if (!ALLOW) return;

    const env = loadEnv();
    prisma = createPrismaClient(env);
    await prisma.$connect();
    app = createApp(createContainer(env, prisma), env);

    await prisma.user.create({
      data: {
        id: DEMO_USER_ID,
        nombre: `Ingesta Demo Gate ${RUN_ID}`,
        esDemo: true,
      },
    });

    const account = await prisma.account.create({
      data: {
        userId: DEMO_USER_ID,
        banco: 'BCI',
        tipoCuenta: 'Cuenta Corriente',
        numeroCuenta: `bci-demo-${RUN_ID}`,
      },
    });
    accountId = account.id;

    const ingesta = await prisma.ingesta.create({
      data: {
        userId: DEMO_USER_ID,
        accountId,
        banco: 'BCI',
        nombreArchivo: `demo-${RUN_ID}.xlsx`,
        estado: 'PROCESADA',
        totalTransacciones: 0,
      },
    });
    ingestaId = ingesta.id;

    const session = await crearSesionParaUsuario(prisma, DEMO_USER_ID);
    authDemo = `Bearer ${session.token}`;
  });

  afterAll(async () => {
    if (!ALLOW) return;

    await prisma.transaccion.deleteMany({ where: { accountId } });
    await prisma.ingesta.deleteMany({ where: { userId: DEMO_USER_ID } });
    await prisma.account.deleteMany({ where: { id: accountId } });
    await prisma.session.deleteMany({ where: { userId: DEMO_USER_ID } });
    await prisma.user.deleteMany({ where: { id: DEMO_USER_ID } });
    await prisma.$disconnect();
  });

  it("GET /api/ingestas still returns 200 with the demo session's own cartolas", async () => {
    if (!ALLOW) return;
    const res = await request(app)
      .get('/api/ingestas')
      .set('x-api-key', API_KEY)
      .set('Authorization', authDemo)
      .expect(200);
    expect(res.body.ingestas.length).toBeGreaterThan(0);
  });

  it('DELETE /api/ingestas/:id → 403 DEMO_SOLO_LECTURA', async () => {
    if (!ALLOW) return;
    const res = await request(app)
      .delete(`/api/ingestas/${ingestaId}`)
      .set('x-api-key', API_KEY)
      .set('Authorization', authDemo);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('DEMO_SOLO_LECTURA');
  });

  it('the rejected DELETE mutated nothing — the ingesta survives', async () => {
    if (!ALLOW) return;
    const ingesta = await prisma.ingesta.findUnique({
      where: { id: ingestaId },
    });
    expect(ingesta).not.toBeNull();
  });

  it('POST /api/ingestas (one-shot) → 403 DEMO_SOLO_LECTURA, no Ingesta row created (incl. no FALLIDA)', async () => {
    if (!ALLOW) return;
    const ingestasAntes = await prisma.ingesta.count({
      where: { userId: DEMO_USER_ID },
    });

    const res = await request(app)
      .post('/api/ingestas')
      .set('x-api-key', API_KEY)
      .set('Authorization', authDemo)
      .attach('file', xlsxFixture, `one-shot-${RUN_ID}.xlsx`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('DEMO_SOLO_LECTURA');

    const ingestasDespues = await prisma.ingesta.count({
      where: { userId: DEMO_USER_ID },
    });
    expect(ingestasDespues).toBe(ingestasAntes);
    const fallidas = await prisma.ingesta.count({
      where: { userId: DEMO_USER_ID, estado: 'FALLIDA' },
    });
    expect(fallidas).toBe(0);
  });

  it('POST /api/ingestas/commit → 403 DEMO_SOLO_LECTURA, no Ingesta row created (incl. no FALLIDA)', async () => {
    if (!ALLOW) return;
    const ingestasAntes = await prisma.ingesta.count({
      where: { userId: DEMO_USER_ID },
    });

    const res = await request(app)
      .post('/api/ingestas/commit')
      .set('x-api-key', API_KEY)
      .set('Authorization', authDemo)
      .attach('file', xlsxFixture, `commit-${RUN_ID}.xlsx`)
      .field('edits', '[]');

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('DEMO_SOLO_LECTURA');

    const ingestasDespues = await prisma.ingesta.count({
      where: { userId: DEMO_USER_ID },
    });
    expect(ingestasDespues).toBe(ingestasAntes);
    const fallidas = await prisma.ingesta.count({
      where: { userId: DEMO_USER_ID, estado: 'FALLIDA' },
    });
    expect(fallidas).toBe(0);
  });
});
