/**
 * perfil-crud.int-spec.ts — US-040 (Phase 7.1).
 *
 * PERF040-01 (nombre-only leaves the email columns byte-identical; nombre +
 * email together reflected in /auth/me), PERF040-03 (email half: wrong
 * passwordActual on an email change), PERF040-04 (email already taken is
 * byte-identical to the wrong-password response), AUTH-09 (/auth/me
 * returns nombre).
 *
 * Requires a real DB. Run via
 * `ALLOW_DESTRUCTIVE_DB=1 pnpm api test:integration -- perfil-crud`.
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
const PASSWORD = 'correcto-123-clave-perfil';

const RUN_ID = `perfil-crud-int-${Date.now()}`;
const EMAIL_A = `${RUN_ID}-a@example.com`;
const EMAIL_B = `${RUN_ID}-taken@example.com`;

describe('PATCH /api/perfil — CRUD (PERF040-01/03/04, AUTH-09)', () => {
  let app: Express;
  let prisma: PrismaClient;
  let userIdA: string;
  let userIdB: string;
  let authA: string;

  beforeAll(async () => {
    if (!ALLOW) return;

    const env = loadEnv();
    prisma = createPrismaClient(env);
    await prisma.$connect();
    app = createApp(createContainer(env, prisma), env);

    const passwordHash = await new Argon2PasswordHasher().hash(PASSWORD);
    const userA = await prisma.user.create({
      data: {
        nombre: `Perfil A ${RUN_ID}`,
        ...buildEncryptedEmailFields(EMAIL_A, env),
        passwordHash,
      },
    });
    userIdA = userA.id;

    const userB = await prisma.user.create({
      data: {
        nombre: `Perfil B ${RUN_ID}`,
        ...buildEncryptedEmailFields(EMAIL_B, env),
        passwordHash,
      },
    });
    userIdB = userB.id;

    const sessionA = await crearSesionParaUsuario(prisma, userIdA);
    authA = `Bearer ${sessionA.token}`;
  });

  afterAll(async () => {
    if (!ALLOW) return;

    await prisma.session.deleteMany({
      where: { userId: { in: [userIdA, userIdB] } },
    });
    await prisma.user.deleteMany({ where: { id: { in: [userIdA, userIdB] } } });
    await prisma.$disconnect();
  });

  it('nombre-only ⇒ 200, y las columnas email/emailBlindIndex quedan BYTE-IDÉNTICAS (PERF040-01)', async () => {
    if (!ALLOW) return;

    const before = await prisma.user.findUniqueOrThrow({
      where: { id: userIdA },
      select: { email: true, emailBlindIndex: true },
    });

    const res = await request(app)
      .patch('/api/perfil')
      .set('x-api-key', API_KEY)
      .set('Authorization', authA)
      .send({ nombre: `Renombrado ${RUN_ID}` })
      .expect(200);

    expect(res.body.nombre).toBe(`Renombrado ${RUN_ID}`);

    const after = await prisma.user.findUniqueOrThrow({
      where: { id: userIdA },
      select: { email: true, emailBlindIndex: true },
    });
    expect(after.email).toBe(before.email);
    expect(after.emailBlindIndex).toBe(before.emailBlindIndex);
  });

  it('nombre + email juntos ⇒ 200, y GET /api/auth/me refleja ambos después (PERF040-01)', async () => {
    if (!ALLOW) return;

    const nuevoEmail = `${RUN_ID}-a-cambiado@example.com`;
    const res = await request(app)
      .patch('/api/perfil')
      .set('x-api-key', API_KEY)
      .set('Authorization', authA)
      .send({
        nombre: `Ambos ${RUN_ID}`,
        email: nuevoEmail,
        passwordActual: PASSWORD,
      })
      .expect(200);

    expect(res.body.nombre).toBe(`Ambos ${RUN_ID}`);
    expect(res.body.email).toBe(nuevoEmail);

    const me = await request(app)
      .get('/api/auth/me')
      .set('x-api-key', API_KEY)
      .set('Authorization', authA)
      .expect(200);
    expect(me.body.nombre).toBe(`Ambos ${RUN_ID}`);
    expect(me.body.email).toBe(nuevoEmail);
  });

  it('passwordActual incorrecto en un cambio de email ⇒ 403 PERFIL_RECHAZADO, columnas de email sin cambios (PERF040-03)', async () => {
    if (!ALLOW) return;

    const before = await prisma.user.findUniqueOrThrow({
      where: { id: userIdA },
      select: { email: true, emailBlindIndex: true },
    });

    const res = await request(app)
      .patch('/api/perfil')
      .set('x-api-key', API_KEY)
      .set('Authorization', authA)
      .send({
        email: `${RUN_ID}-nope@example.com`,
        passwordActual: 'incorrecta',
      })
      .expect(403);

    expect(res.body.code).toBe('PERFIL_RECHAZADO');

    const after = await prisma.user.findUniqueOrThrow({
      where: { id: userIdA },
      select: { email: true, emailBlindIndex: true },
    });
    expect(after.email).toBe(before.email);
    expect(after.emailBlindIndex).toBe(before.emailBlindIndex);
  });

  it('email ya tomado por otra cuenta (con password correcta) ⇒ body BYTE-IDÉNTICO al caso de password incorrecta; B no se toca (PERF040-04)', async () => {
    if (!ALLOW) return;

    const wrongPasswordRes = await request(app)
      .patch('/api/perfil')
      .set('x-api-key', API_KEY)
      .set('Authorization', authA)
      .send({
        email: `${RUN_ID}-otro@example.com`,
        passwordActual: 'incorrecta',
      })
      .expect(403);

    const beforeB = await prisma.user.findUniqueOrThrow({
      where: { id: userIdB },
      select: { email: true, emailBlindIndex: true },
    });

    const emailTakenRes = await request(app)
      .patch('/api/perfil')
      .set('x-api-key', API_KEY)
      .set('Authorization', authA)
      .send({ email: EMAIL_B, passwordActual: PASSWORD })
      .expect(403);

    expect(emailTakenRes.body).toEqual(wrongPasswordRes.body);

    const afterB = await prisma.user.findUniqueOrThrow({
      where: { id: userIdB },
      select: { email: true, emailBlindIndex: true },
    });
    expect(afterB.email).toBe(beforeB.email);
    expect(afterB.emailBlindIndex).toBe(beforeB.emailBlindIndex);
  });
});
