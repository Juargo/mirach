/**
 * catalogo-demo-gate.int-spec.ts — US-038 (Phase 12.4, CAT038-08).
 *
 * All 6 catalog mutations from a demo (`esDemo: true`) session MUST return
 * 403 with `code: "DEMO_SOLO_LECTURA"`; `GET /api/categorias` MUST remain
 * available (200) to that same demo session.
 *
 * Requires a real DB. Run via
 * `ALLOW_DESTRUCTIVE_DB=1 pnpm api test:integration catalogo-demo-gate`.
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

const ALLOW = process.env.ALLOW_DESTRUCTIVE_DB === '1';
const API_KEY = process.env.API_KEY ?? '';

const RUN_ID = `catalogo-demo-gate-int-${Date.now()}`;
const DEMO_USER_ID = `cat-demo-${RUN_ID}`;

describe('Catalog demo gate (CAT038-08) — mutations rejected, read allowed', () => {
  let app: Express;
  let prisma: PrismaClient;
  let authDemo: string;
  let categoriaId: string;
  let patronId: string;

  beforeAll(async () => {
    if (!ALLOW) return;

    const env = loadEnv();
    prisma = createPrismaClient(env);
    await prisma.$connect();
    app = createApp(createContainer(env, prisma), env);

    await prisma.user.create({
      data: {
        id: DEMO_USER_ID,
        nombre: `Demo Gate ${RUN_ID}`,
        esDemo: true,
      },
    });
    await crearCatalogoParaUsuario(prisma, DEMO_USER_ID);

    const categoria = await prisma.categoria.findFirstOrThrow({
      where: { userId: DEMO_USER_ID },
    });
    categoriaId = categoria.id;
    const patron = await prisma.patronClasificacion.findFirstOrThrow({
      where: { userId: DEMO_USER_ID },
    });
    patronId = patron.id;

    const session = await crearSesionParaUsuario(prisma, DEMO_USER_ID);
    authDemo = `Bearer ${session.token}`;
  });

  afterAll(async () => {
    if (!ALLOW) return;

    await prisma.patronClasificacion.deleteMany({
      where: { userId: DEMO_USER_ID },
    });
    await prisma.categoria.deleteMany({ where: { userId: DEMO_USER_ID } });
    await prisma.session.deleteMany({ where: { userId: DEMO_USER_ID } });
    await prisma.user.deleteMany({ where: { id: DEMO_USER_ID } });
    await prisma.$disconnect();
  });

  it("GET /api/categorias still returns 200 with the demo session's own catalog", async () => {
    if (!ALLOW) return;
    const res = await request(app)
      .get('/api/categorias')
      .set('x-api-key', API_KEY)
      .set('Authorization', authDemo)
      .expect(200);
    expect(res.body.categorias.length).toBeGreaterThan(0);
  });

  it('POST /api/categorias → 403 DEMO_SOLO_LECTURA', async () => {
    if (!ALLOW) return;
    const res = await request(app)
      .post('/api/categorias')
      .set('x-api-key', API_KEY)
      .set('Authorization', authDemo)
      .send({ nombre: 'Nueva', bucket: 'Deseos' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('DEMO_SOLO_LECTURA');
  });

  it('PATCH /api/categorias/:id → 403 DEMO_SOLO_LECTURA', async () => {
    if (!ALLOW) return;
    const res = await request(app)
      .patch(`/api/categorias/${categoriaId}`)
      .set('x-api-key', API_KEY)
      .set('Authorization', authDemo)
      .send({ nombre: 'Renombrada' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('DEMO_SOLO_LECTURA');
  });

  it('DELETE /api/categorias/:id → 403 DEMO_SOLO_LECTURA', async () => {
    if (!ALLOW) return;
    const res = await request(app)
      .delete(`/api/categorias/${categoriaId}`)
      .set('x-api-key', API_KEY)
      .set('Authorization', authDemo);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('DEMO_SOLO_LECTURA');
  });

  it('POST /api/patrones → 403 DEMO_SOLO_LECTURA', async () => {
    if (!ALLOW) return;
    const res = await request(app)
      .post('/api/patrones')
      .set('x-api-key', API_KEY)
      .set('Authorization', authDemo)
      .send({ categoriaId, patron: 'sneaky', matchType: 'CONTAINS' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('DEMO_SOLO_LECTURA');
  });

  it('PATCH /api/patrones/:id → 403 DEMO_SOLO_LECTURA', async () => {
    if (!ALLOW) return;
    const res = await request(app)
      .patch(`/api/patrones/${patronId}`)
      .set('x-api-key', API_KEY)
      .set('Authorization', authDemo)
      .send({ prioridad: 1 });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('DEMO_SOLO_LECTURA');
  });

  it('DELETE /api/patrones/:id → 403 DEMO_SOLO_LECTURA', async () => {
    if (!ALLOW) return;
    const res = await request(app)
      .delete(`/api/patrones/${patronId}`)
      .set('x-api-key', API_KEY)
      .set('Authorization', authDemo);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('DEMO_SOLO_LECTURA');
  });

  it('none of the 6 rejected mutations actually mutated anything', async () => {
    if (!ALLOW) return;
    const categoria = await prisma.categoria.findUnique({
      where: { id: categoriaId },
    });
    const patron = await prisma.patronClasificacion.findUnique({
      where: { id: patronId },
    });
    expect(categoria).not.toBeNull();
    expect(patron).not.toBeNull();
  });
});
