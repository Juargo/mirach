/**
 * E2E tests for POST /api/auth/login rate limiting (AUTH-08).
 *
 * Requires a real DB. Run via `pnpm api test:e2e` (sets ALLOW_DESTRUCTIVE_DB=1).
 *
 * DEFERRED (apply batch note): same prerequisites as auth-login.e2e-spec.ts —
 * NOT executed against the real DB by this apply batch. See that file's
 * header for the migration-then-seed ordering.
 *
 * Each `it` seeds its own user so the two scenarios (exhaustion vs.
 * not-throttled) don't share rate-limit counters and interfere with each
 * other within the same LoginRateLimiter instance (one AuthModule → one
 * limiter for the whole app.getHttpServer() lifetime of this file).
 */
import request from 'supertest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createApp } from '../src/infrastructure/http-express/app';
import { createContainer } from '../src/composition/container';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';
import { Argon2PasswordHasher } from '../src/infrastructure/http/auth/argon2-password-hasher';

const ALLOW = process.env.ALLOW_DESTRUCTIVE_DB === '1';
const API_KEY = process.env.API_KEY ?? '';
const MAX_POR_EMAIL = Number(process.env.LOGIN_RATELIMIT_MAX_EMAIL ?? 5);

const RUN_ID = `auth-ratelimit-e2e-${Date.now()}`;
const PASSWORD = 'correcto-123-clave';

describe('AuthController (e2e) — rate limiting on POST /api/auth/login', () => {
  let app: Express;
  let prisma: PrismaClient;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    if (!ALLOW) return;

    prisma = createPrismaClient();
    await prisma.$connect();
    app = createApp(createContainer(prisma));
  });

  afterAll(async () => {
    if (!ALLOW) return;

    await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  async function seedUsuario(suffix: string): Promise<{ userId: string; email: string }> {
    const email = `${RUN_ID}-${suffix}@example.com`;
    const passwordHash = await new Argon2PasswordHasher().hash(PASSWORD);
    const user = await prisma.user.create({
      data: { nombre: `E2E RateLimit User ${suffix}`, email, passwordHash },
    });
    createdUserIds.push(user.id);
    return { userId: user.id, email };
  }

  it(`${MAX_POR_EMAIL}+1 intentos fallidos para un email → 429 (distinto del 401)`, async () => {
    if (!ALLOW) return;

    const { email } = await seedUsuario('exhaustion');

    for (let i = 0; i < MAX_POR_EMAIL; i++) {
      await request(app)
        .post('/api/auth/login')
        .set('x-api-key', API_KEY)
        .send({ email, password: 'password-incorrecto' })
        .expect(401);
    }

    // El intento (maxAttemptsPerEmail + 1) queda bloqueado — 429, distinto del 401 anterior
    await request(app)
      .post('/api/auth/login')
      .set('x-api-key', API_KEY)
      .send({ email, password: 'password-incorrecto' })
      .expect(429);

    // Incluso con la contraseña CORRECTA, sigue bloqueado (cuenta fallos, pero
    // el bloqueo en sí no distingue — el check corre antes de LoginUseCase)
    await request(app)
      .post('/api/auth/login')
      .set('x-api-key', API_KEY)
      .send({ email, password: PASSWORD })
      .expect(429);
  });

  it('un login correcto no es throttled (fallos por debajo del umbral no bloquean el éxito)', async () => {
    if (!ALLOW) return;

    const { email } = await seedUsuario('not-throttled');

    // Menos fallos que el umbral
    for (let i = 0; i < MAX_POR_EMAIL - 1; i++) {
      await request(app)
        .post('/api/auth/login')
        .set('x-api-key', API_KEY)
        .send({ email, password: 'password-incorrecto' })
        .expect(401);
    }

    // El login correcto sigue funcionando — nunca throttled por éxito (AUTH-08)
    await request(app)
      .post('/api/auth/login')
      .set('x-api-key', API_KEY)
      .send({ email, password: PASSWORD })
      .expect(200);
  });
});
