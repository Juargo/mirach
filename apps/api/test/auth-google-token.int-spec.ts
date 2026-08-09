/**
 * Integration tests for the real POST /api/auth/google/token flow (Slice
 * B2, design §11.2): DB-backed guarantees for `LoginConGoogleUseCase` +
 * `PrismaIdentidadGoogleRepository` + `PrismaSessionRepository` wired
 * together against a REAL Postgres, through the actual HTTP route. Never
 * talks to live Google — `verificadorIdToken` is a double of
 * `IVerificadorIdTokenExterno` (never live Google, per ADR-034/ADR-035's
 * consequence). Everything downstream of the verified identity (session
 * issuance, linking, demo/rule-★ gates) is real.
 *
 * Mirrors `auth-google-callback.int-spec.ts`'s pattern for the web flow —
 * same real collaborators, different route + port double.
 *
 * Requires a real DB. Run via `pnpm api test:integration` (sets
 * ALLOW_DESTRUCTIVE_DB=1) — see apps/api/docs/local-test-db.md. Runs in CI
 * (`integration` job, postgres:16-alpine service container).
 */
import request from 'supertest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createApp } from '../src/infrastructure/http-express/app';
import { createContainer, type Container } from '../src/composition/container';
import type { GoogleAuthMobileGraph } from '../src/composition/crear-auth-google-mobile';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';
import { loadEnv } from '../src/config/env';
import { Result } from '../src/shared/result';
import { LoginConGoogleUseCase } from '../src/application/use-cases/login-con-google.use-case';
import { PrismaIdentidadGoogleRepository } from '../src/infrastructure/persistence/prisma-identidad-google.repository';
import { PrismaSessionRepository } from '../src/infrastructure/persistence/prisma-session.repository';
import { Sha256SessionTokenService } from '../src/infrastructure/http/auth/sha256-session-token.service';
import { SystemReloj } from '../src/infrastructure/http/auth/system-reloj';
import { IpRateLimiter } from '../src/infrastructure/http/auth/ip-rate-limiter';
import { HmacBlindIndexService } from '../src/infrastructure/persistence/hmac-blind-index.service';
import { deriveBlindIndexKey } from '../src/composition/derive-blind-index-key';
import { buildEncryptedEmailFields } from './support/encrypted-email.fixture';
import type { IdentidadExterna } from '../src/application/ports/verificador-identidad-externa.port';

const ALLOW = process.env.ALLOW_DESTRUCTIVE_DB === '1';
const API_KEY = process.env.API_KEY ?? '';

const RUN_ID = `auth-google-token-int-${Date.now()}`;

/** Builds a `verificarIdToken` double that always resolves to `identidad` (never live Google). */
function verificadorQueDevuelve(identidad: IdentidadExterna) {
  return {
    verificarIdToken: vi.fn().mockResolvedValue(Result.ok(identidad)),
  };
}

describe('POST /api/auth/google/token (int) — LoginConGoogleUseCase against a real DB', () => {
  let prisma: PrismaClient;
  let appSinMobile: Express;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    if (!ALLOW) return;

    const env = loadEnv();
    prisma = createPrismaClient(env);
    await prisma.$connect();

    // La app real (createContainer) no tiene `googleAuthMobile` definido en
    // este entorno de test (`GOOGLE_CLIENT_ID_ANDROID` no está seteado en
    // `.env.test` — P2/design §7, activación por presencia). Se usa TAL
    // CUAL para el test de 404 (AUTH-22); cada test que ejercita el flujo
    // habilitado construye su PROPIA app vía `appConVerificador` con un
    // `verificadorIdToken` DOBLE — nunca live Google.
    const baseContainer: Container = createContainer(env, prisma);
    appSinMobile = createApp(baseContainer, env);
  });

  afterAll(async () => {
    if (!ALLOW) return;

    if (createdUserIds.length > 0) {
      await prisma.session.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  });

  /**
   * Builds an app wired with the given `verificadorIdToken` double, reusing
   * the real `loginConGoogle`/repos constructed in `beforeAll` — only the
   * port double changes per test (design §11.2's testing rule: always a
   * double of `IVerificadorIdTokenExterno`, never live Google).
   */
  function appConVerificador(identidad: IdentidadExterna): Express {
    const env = loadEnv();
    const blindIndex = new HmacBlindIndexService(
      deriveBlindIndexKey(Buffer.from(env.ENCRYPTION_KEY, 'base64')),
    );
    const identidades = new PrismaIdentidadGoogleRepository(prisma, blindIndex);
    const sessions = new PrismaSessionRepository(prisma);
    const tokens = new Sha256SessionTokenService();
    const reloj = new SystemReloj();
    const loginConGoogle = new LoginConGoogleUseCase(
      identidades,
      sessions,
      tokens,
      reloj,
    );

    const googleAuthMobile: GoogleAuthMobileGraph = {
      verificadorIdToken: verificadorQueDevuelve(identidad),
      loginConGoogle,
      googleTokenRateLimiter: new IpRateLimiter(
        `google-token:ip:${RUN_ID}:${identidad.sub}:`,
        1000,
        900_000,
      ),
    };

    const baseContainer: Container = createContainer(env, prisma);
    return createApp({ ...baseContainer, googleAuthMobile }, env);
  }

  async function crearUsuario(data: {
    emailRaw: string | null;
    googleSub?: string | null;
    esDemo?: boolean;
  }): Promise<string> {
    const env = loadEnv();
    const emailFields =
      data.emailRaw !== null
        ? buildEncryptedEmailFields(data.emailRaw, env)
        : { email: null, emailBlindIndex: null };

    const user = await prisma.user.create({
      data: {
        nombre: 'Int Spec User',
        email: emailFields.email,
        emailBlindIndex: emailFields.emailBlindIndex,
        googleSub: data.googleSub ?? null,
        esDemo: data.esDemo ?? false,
      },
    });
    createdUserIds.push(user.id);
    return user.id;
  }

  it('happy path: emite una Session real (SHA-256, expiresAt = creación + 7d) indistinguible de password login — AUTH-20', async () => {
    if (!ALLOW) return;

    const email = `${RUN_ID}-happy@example.com`;
    const sub = `sub-${RUN_ID}-happy`;
    const userId = await crearUsuario({ emailRaw: email });

    const before = await prisma.session.count();

    const res = await request(
      appConVerificador({ sub, email, emailVerificado: true }),
    )
      .post('/api/auth/google/token')
      .set('x-api-key', API_KEY)
      .send({ idToken: 'fake-id-token' });

    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(userId);
    expect(res.headers['set-cookie']).toBeUndefined();

    const linkedUser = await prisma.user.findUnique({ where: { id: userId } });
    expect(linkedUser?.googleSub).toBe(sub);

    const sessions = await prisma.session.findMany({ where: { userId } });
    expect(sessions).toHaveLength(1);
    const session = sessions[0];
    expect(session.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(session.tokenHash).not.toBe(res.body.token); // el token crudo nunca se persiste

    const ttlMs = session.expiresAt.getTime() - session.creadoEn.getTime();
    expect(Math.abs(ttlMs - 7 * 24 * 60 * 60 * 1000)).toBeLessThan(5_000);

    expect(await prisma.session.count()).toBe(before + 1);
  });

  it('identidad desconocida (sin match por googleSub ni email) → 401 genérico, cero usuarios creados', async () => {
    if (!ALLOW) return;

    const email = `${RUN_ID}-unknown@example.com`;
    const sub = `sub-${RUN_ID}-unknown`;
    const usersBefore = await prisma.user.count();

    const res = await request(
      appConVerificador({ sub, email, emailVerificado: true }),
    )
      .post('/api/auth/google/token')
      .set('x-api-key', API_KEY)
      .send({ idToken: 'fake-id-token' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Credenciales inválidas.' });
    expect(await prisma.user.count()).toBe(usersBefore);
  });

  it('email_verified: false → 401 genérico, googleSub NUNCA se escribe', async () => {
    if (!ALLOW) return;

    const email = `${RUN_ID}-unverified@example.com`;
    const sub = `sub-${RUN_ID}-unverified`;
    const userId = await crearUsuario({ emailRaw: email });

    const res = await request(
      appConVerificador({ sub, email, emailVerificado: false }),
    )
      .post('/api/auth/google/token')
      .set('x-api-key', API_KEY)
      .send({ idToken: 'fake-id-token' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Credenciales inválidas.' });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    expect(user?.googleSub).toBeNull();
  });

  it('cuenta demo, resuelta por googleSub → 401 genérico', async () => {
    if (!ALLOW) return;

    const sub = `sub-${RUN_ID}-demo-by-sub`;
    await crearUsuario({ emailRaw: null, googleSub: sub, esDemo: true });

    const res = await request(
      appConVerificador({ sub, email: null, emailVerificado: false }),
    )
      .post('/api/auth/google/token')
      .set('x-api-key', API_KEY)
      .send({ idToken: 'fake-id-token' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Credenciales inválidas.' });
  });

  it('cuenta demo, resuelta por email (sin googleSub previo) → 401 genérico, sin vincular', async () => {
    if (!ALLOW) return;

    const email = `${RUN_ID}-demo-by-email@example.com`;
    const sub = `sub-${RUN_ID}-demo-by-email`;
    const userId = await crearUsuario({ emailRaw: email, esDemo: true });

    const res = await request(
      appConVerificador({ sub, email, emailVerificado: true }),
    )
      .post('/api/auth/google/token')
      .set('x-api-key', API_KEY)
      .send({ idToken: 'fake-id-token' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Credenciales inválidas.' });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    expect(user?.googleSub).toBeNull();
  });

  it('email ya vinculado a OTRO googleSub (regla ★) → 401 genérico, el googleSub almacenado NO se sobrescribe', async () => {
    if (!ALLOW) return;

    const email = `${RUN_ID}-already-linked@example.com`;
    const existingSub = `sub-${RUN_ID}-existing`;
    const attackerSub = `sub-${RUN_ID}-attacker`;
    const userId = await crearUsuario({
      emailRaw: email,
      googleSub: existingSub,
    });

    const res = await request(
      appConVerificador({ sub: attackerSub, email, emailVerificado: true }),
    )
      .post('/api/auth/google/token')
      .set('x-api-key', API_KEY)
      .send({ idToken: 'fake-id-token' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Credenciales inválidas.' });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    expect(user?.googleSub).toBe(existingSub);
  });

  it('404 cuando el container no tiene googleAuthMobile (feature apagado) — AUTH-22', async () => {
    if (!ALLOW) return;

    const res = await request(appSinMobile)
      .post('/api/auth/google/token')
      .set('x-api-key', API_KEY)
      .send({ idToken: 'fake-id-token' });

    expect(res.status).toBe(404);
  });
});
