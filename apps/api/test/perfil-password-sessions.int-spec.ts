/**
 * perfil-password-sessions.int-spec.ts — US-040 (Phase 15.1, PERF040-06).
 *
 * THE BINDING SESSION-REVOCATION TEST — the change's headline proof for
 * PR#2 (design.md §6.5). Scaffolded from `catalogo-demo-gate.int-spec.ts`
 * with `crearSesionParaUsuario`.
 *
 * One user, two real sessions A (caller) and B (sibling). A changes the
 * password: B is rejected afterward, A still works, exactly one session
 * survives (A's), and the new password logs in while the old one fails.
 *
 * Requires a real DB. Run via
 * `ALLOW_DESTRUCTIVE_DB=1 pnpm api test:integration -- perfil-password-sessions`.
 */
import 'dotenv/config';
import request from 'supertest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createApp } from '../src/infrastructure/http-express/app';
import { createContainer } from '../src/composition/container';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';
import { loadEnv } from '../src/config/env';
import { Argon2PasswordHasher } from '../src/infrastructure/http/auth/argon2-password-hasher';
import { buildEncryptedEmailFields } from './support/encrypted-email.fixture';
import { crearSesionParaUsuario } from './support/session.fixture';

const ALLOW = process.env.ALLOW_DESTRUCTIVE_DB === '1';
const API_KEY = process.env.API_KEY ?? '';
const PASSWORD_VIEJA = 'password-vieja-valida-123';
const PASSWORD_NUEVA = 'password-nueva-valida-456';

const RUN_ID = `perfil-password-sessions-int-${Date.now()}`;
const EMAIL = `${RUN_ID}@example.com`;

describe('PATCH /api/perfil/password — revocación de otras sesiones (PERF040-06)', () => {
  let app: Express;
  let prisma: PrismaClient;
  let userId: string;
  let authA: string;
  let authB: string;
  let tokenHashB: string;

  beforeAll(async () => {
    if (!ALLOW) return;

    const env = loadEnv();
    prisma = createPrismaClient(env);
    await prisma.$connect();
    app = createApp(createContainer(env, prisma), env);

    const passwordHash = await new Argon2PasswordHasher().hash(PASSWORD_VIEJA);
    const user = await prisma.user.create({
      data: {
        nombre: `Perfil Password Sessions ${RUN_ID}`,
        ...buildEncryptedEmailFields(EMAIL, env),
        passwordHash,
      },
    });
    userId = user.id;

    const sessionA = await crearSesionParaUsuario(prisma, userId);
    authA = `Bearer ${sessionA.token}`;

    const sessionB = await crearSesionParaUsuario(prisma, userId);
    authB = `Bearer ${sessionB.token}`;
    tokenHashB = (
      await prisma.session.findUniqueOrThrow({
        where: { id: sessionB.sessionId },
      })
    ).tokenHash;
  });

  afterAll(async () => {
    if (!ALLOW) return;

    await prisma.session.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('ambas sesiones funcionan ANTES del cambio de password (pre-condición)', async () => {
    if (!ALLOW) return;

    await request(app)
      .get('/api/auth/me')
      .set('x-api-key', API_KEY)
      .set('Authorization', authA)
      .expect(200);

    await request(app)
      .get('/api/auth/me')
      .set('x-api-key', API_KEY)
      .set('Authorization', authB)
      .expect(200);
  });

  it('A cambia la password ⇒ 204', async () => {
    if (!ALLOW) return;

    await request(app)
      .patch('/api/perfil/password')
      .set('x-api-key', API_KEY)
      .set('Authorization', authA)
      .send({ passwordActual: PASSWORD_VIEJA, passwordNueva: PASSWORD_NUEVA })
      .expect(204);
  });

  it('B queda rechazada (401) — otra sesión del mismo usuario, revocada', async () => {
    if (!ALLOW) return;

    await request(app)
      .get('/api/auth/me')
      .set('x-api-key', API_KEY)
      .set('Authorization', authB)
      .expect(401);
  });

  it('A sigue funcionando (200) — la sesión que hizo el cambio se conserva', async () => {
    if (!ALLOW) return;

    await request(app)
      .get('/api/auth/me')
      .set('x-api-key', API_KEY)
      .set('Authorization', authA)
      .expect(200);
  });

  it('queda EXACTAMENTE 1 sesión para el usuario, y es la de A (no la de B)', async () => {
    if (!ALLOW) return;

    const sesiones = await prisma.session.findMany({ where: { userId } });
    expect(sesiones).toHaveLength(1);
    expect(sesiones[0].tokenHash).not.toBe(tokenHashB);
  });

  it('login con la password NUEVA ⇒ 200; con la VIEJA ⇒ 401', async () => {
    if (!ALLOW) return;

    await request(app)
      .post('/api/auth/login')
      .set('x-api-key', API_KEY)
      .send({ email: EMAIL, password: PASSWORD_NUEVA })
      .expect(200);

    await request(app)
      .post('/api/auth/login')
      .set('x-api-key', API_KEY)
      .send({ email: EMAIL, password: PASSWORD_VIEJA })
      .expect(401);
  });
});
