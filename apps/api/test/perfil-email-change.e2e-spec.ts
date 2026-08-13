/**
 * perfil-email-change.e2e-spec.ts — US-040 (Phase 7.4). THE BINDING E2E —
 * the change's headline test (design.md §6.4). This is the regression test
 * for the 2026-08-02 production lockout: it proves the email ciphertext and
 * the blind index NEVER derive from different strings or different keys —
 * the entire hazard class of design.md §1/D-01.
 *
 * If only one test survives review, it is this one.
 *
 * Requires a real DB. Run via
 * `ALLOW_DESTRUCTIVE_DB=1 pnpm api test:e2e -- perfil-email-change`.
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
import { AesGcmCryptoService } from '../src/infrastructure/persistence/aes-gcm-crypto.service';
import { HmacBlindIndexService } from '../src/infrastructure/persistence/hmac-blind-index.service';
import { deriveBlindIndexKey } from '../src/composition/derive-blind-index-key';

const ALLOW = process.env.ALLOW_DESTRUCTIVE_DB === '1';
const API_KEY = process.env.API_KEY ?? '';
const PASSWORD = 'correcto-123-clave-email-change';

const RUN_ID = `perfil-email-change-e2e-${Date.now()}`;
const EMAIL_VIEJO = `${RUN_ID}-viejo@example.com`;
const EMAIL_NUEVO_NORMALIZADO = `${RUN_ID}-nuevo@example.com`;
// Mixed case + surrounding spaces — also pins normalization (§6.4 step 3).
const EMAIL_NUEVO_RAW = `  ${EMAIL_NUEVO_NORMALIZADO.toUpperCase()}  `;

describe('THE BINDING E2E — email change proves the ciphertext/blind-index invariant end to end (PERF040-02)', () => {
  let app: Express;
  let prisma: PrismaClient;
  let userId: string;

  beforeAll(async () => {
    if (!ALLOW) return;

    const env = loadEnv();
    prisma = createPrismaClient(env);
    await prisma.$connect();
    app = createApp(createContainer(env, prisma), env);

    const passwordHash = await new Argon2PasswordHasher().hash(PASSWORD);
    // buildEncryptedEmailFields cifra + computa el blind index EXACTAMENTE
    // como lo hace el container real — nunca hand-roll la encriptación.
    const user = await prisma.user.create({
      data: {
        nombre: `Binding E2E ${RUN_ID}`,
        ...buildEncryptedEmailFields(EMAIL_VIEJO, env),
        passwordHash,
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    if (!ALLOW) return;

    await prisma.session.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('login(OLD) succeeds → PATCH email → login(NEW) succeeds → login(OLD) fails → DB row independently re-derives to the SAME pair', async () => {
    if (!ALLOW) return;

    // 1. Login con el email VIEJO ⇒ 200, capturamos la cookie.
    const loginViejo = await request(app)
      .post('/api/auth/login')
      .set('x-api-key', API_KEY)
      .send({ email: EMAIL_VIEJO, password: PASSWORD })
      .expect(200);
    const rawCookie = (
      loginViejo.headers['set-cookie'] as unknown as string[]
    )[0];
    const cookie = rawCookie.split(';')[0];

    // 2. PATCH /api/perfil con el email nuevo (mixed case + espacios).
    const patchRes = await request(app)
      .patch('/api/perfil')
      .set('x-api-key', API_KEY)
      .set('Cookie', cookie)
      .send({ email: EMAIL_NUEVO_RAW, passwordActual: PASSWORD })
      .expect(200);
    expect(patchRes.body.email).toBe(EMAIL_NUEVO_NORMALIZADO);

    // 3. Login con el email NUEVO ⇒ 200 — LA INVARIANTE, probada end to
    //    end a través de las claves reales del container.
    await request(app)
      .post('/api/auth/login')
      .set('x-api-key', API_KEY)
      .send({ email: EMAIL_NUEVO_NORMALIZADO, password: PASSWORD })
      .expect(200);

    // 4. Login con el email VIEJO ⇒ 401 — prueba que el blind index se
    //    movió, no que una fila stale sigue matcheando.
    await request(app)
      .post('/api/auth/login')
      .set('x-api-key', API_KEY)
      .send({ email: EMAIL_VIEJO, password: PASSWORD })
      .expect(401);

    // 5. Lee la fila directo y re-deriva AMBAS columnas independientemente
    //    (crypto/blindIndex frescos, no los del container) — confirma que
    //    coinciden como PAR.
    const env = loadEnv();
    const key = Buffer.from(env.ENCRYPTION_KEY, 'base64');
    const crypto = new AesGcmCryptoService(key);
    const blindIndex = new HmacBlindIndexService(deriveBlindIndexKey(key));

    const row = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(crypto.decrypt(row.email!)).toBe(EMAIL_NUEVO_NORMALIZADO);
    expect(row.emailBlindIndex).toBe(
      blindIndex.compute(EMAIL_NUEVO_NORMALIZADO),
    );
  });
});
