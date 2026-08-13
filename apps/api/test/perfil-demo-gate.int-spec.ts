/**
 * perfil-demo-gate.int-spec.ts — US-040 (Phase 7.2, PERF040-08; extended
 * Phase 15.3 for /password). Scaffolded from `catalogo-demo-gate.int-spec.ts`.
 *
 * A demo (`esDemo: true`) session's PATCH /api/perfil and PATCH
 * /api/perfil/password MUST both return 403 with `code: "DEMO_SOLO_LECTURA"`;
 * `GET /api/auth/me` MUST remain available (200) to that same demo session;
 * nothing is written.
 *
 * Requires a real DB. Run via
 * `ALLOW_DESTRUCTIVE_DB=1 pnpm api test:integration -- perfil-demo-gate`.
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

const ALLOW = process.env.ALLOW_DESTRUCTIVE_DB === '1';
const API_KEY = process.env.API_KEY ?? '';

const RUN_ID = `perfil-demo-gate-int-${Date.now()}`;
const DEMO_USER_ID = `perfil-demo-${RUN_ID}`;

describe('Perfil demo gate (PERF040-08) — mutation rejected, /auth/me still allowed', () => {
  let app: Express;
  let prisma: PrismaClient;
  let authDemo: string;

  beforeAll(async () => {
    if (!ALLOW) return;

    const env = loadEnv();
    prisma = createPrismaClient(env);
    await prisma.$connect();
    app = createApp(createContainer(env, prisma), env);

    await prisma.user.create({
      data: {
        id: DEMO_USER_ID,
        nombre: `Perfil Demo ${RUN_ID}`,
        esDemo: true,
      },
    });

    const session = await crearSesionParaUsuario(prisma, DEMO_USER_ID);
    authDemo = `Bearer ${session.token}`;
  });

  afterAll(async () => {
    if (!ALLOW) return;

    await prisma.session.deleteMany({ where: { userId: DEMO_USER_ID } });
    await prisma.user.deleteMany({ where: { id: DEMO_USER_ID } });
    await prisma.$disconnect();
  });

  it('PATCH /api/perfil → 403 DEMO_SOLO_LECTURA', async () => {
    if (!ALLOW) return;

    const res = await request(app)
      .patch('/api/perfil')
      .set('x-api-key', API_KEY)
      .set('Authorization', authDemo)
      .send({ nombre: 'Intento Demo' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('DEMO_SOLO_LECTURA');
  });

  it('GET /api/auth/me sigue devolviendo 200 para la misma sesión demo', async () => {
    if (!ALLOW) return;

    const res = await request(app)
      .get('/api/auth/me')
      .set('x-api-key', API_KEY)
      .set('Authorization', authDemo)
      .expect(200);

    expect(res.body.esDemo).toBe(true);
  });

  it('ninguna columna de User cambió tras el intento rechazado', async () => {
    if (!ALLOW) return;

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: DEMO_USER_ID },
    });
    expect(user.nombre).toBe(`Perfil Demo ${RUN_ID}`);
    expect(user.email).toBeNull();
    expect(user.emailBlindIndex).toBeNull();
  });

  it('PATCH /api/perfil/password → 403 DEMO_SOLO_LECTURA (PERF040-08, Phase 15.3)', async () => {
    if (!ALLOW) return;

    const res = await request(app)
      .patch('/api/perfil/password')
      .set('x-api-key', API_KEY)
      .set('Authorization', authDemo)
      .send({
        passwordActual: 'lo-que-sea',
        passwordNueva: 'lo-que-sea-valida',
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('DEMO_SOLO_LECTURA');
  });

  it('el intento de password demo no dejó passwordHash ni revocó la sesión demo', async () => {
    if (!ALLOW) return;

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: DEMO_USER_ID },
    });
    expect(user.passwordHash).toBeNull();

    await request(app)
      .get('/api/auth/me')
      .set('x-api-key', API_KEY)
      .set('Authorization', authDemo)
      .expect(200);
  });
});
