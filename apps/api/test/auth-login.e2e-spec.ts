/**
 * E2E tests for POST /api/auth/login, POST /api/auth/logout, GET /api/auth/me
 * (Slice 1 — auth backend + gate, dual transport).
 *
 * Requires a real DB. Run via `pnpm api test:e2e` (sets ALLOW_DESTRUCTIVE_DB=1).
 *
 * DEFERRED (apply batch note): this file is written per design.md §8 but was
 * NOT executed against the real DB by this apply batch. Running it requires,
 * in order:
 *   1. `prisma migrate deploy` — applies the Session table + User.email/
 *      passwordHash columns (migration 20260718000000_add_auth_login_session).
 *   2. `ALLOW_DESTRUCTIVE_DB=1 pnpm api test:e2e` — this suite seeds its own
 *      user with a real argon2id hash directly via Prisma (no dependency on
 *      `prisma db seed`).
 *
 * Every scenario below is gated on `ALLOW` so the file still typechecks and
 * is a no-op inside `pnpm api test` (unit config does not even include
 * `test/**\/*.e2e-spec.ts`), mirroring resumen.e2e-spec.ts's convention.
 *
 * Covered scenarios (design.md §8):
 *   - login with seeded creds → 200 + Set-Cookie (HttpOnly/SameSite=Strict/
 *     no Domain=) AND body {token,userId,expiresAt}
 *   - wrong password ≡ unknown email (same status + body shape, AUTH-02)
 *   - GET /api/auth/me: 401 without session, 200 with cookie session (AC-06)
 *   - Bearer transport: 200 with Authorization: Bearer <body.token>, no cookie
 *   - cookie precedence: valid cookie + garbage Bearer still succeeds
 *   - logout clears the cookie and revokes the row; a second session (Y)
 *     still works (AUTH-07 multi-session)
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

const RUN_ID = `auth-login-e2e-${Date.now()}`;
const EMAIL = `${RUN_ID}@example.com`;
const PASSWORD = 'correcto-123-clave';

describe('AuthController (e2e) — /api/auth/login, /logout, /me', () => {
  let app: Express;
  let prisma: PrismaClient;
  let userId: string;

  beforeAll(async () => {
    if (!ALLOW) return;

    prisma = createPrismaClient();
    await prisma.$connect();
    app = createApp(createContainer(prisma));

    const passwordHash = await new Argon2PasswordHasher().hash(PASSWORD);
    const user = await prisma.user.create({
      data: { nombre: 'E2E Auth User', email: EMAIL, passwordHash },
    });
    userId = user.id;
  });

  afterAll(async () => {
    if (!ALLOW) return;

    await prisma.session.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  function extraerNombreValorCookie(res: request.Response): string {
    const raw = res.headers['set-cookie'] as unknown as string[];
    return raw[0]!.split(';')[0]!; // "md_session=<token>"
  }

  it('login con credenciales correctas → 200, Set-Cookie + body {token,userId,expiresAt}', async () => {
    if (!ALLOW) return;

    const res = await request(app)
      .post('/api/auth/login')
      .set('x-api-key', API_KEY)
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200);

    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.userId).toBe(userId);
    expect(res.body.expiresAt).toEqual(expect.any(String));

    const setCookie = res.headers['set-cookie'] as unknown as string[];
    expect(setCookie[0]).toContain('md_session=');
    expect(setCookie[0]).toContain('HttpOnly');
    expect(setCookie[0]).toContain('SameSite=Strict');
    expect(setCookie[0]).not.toContain('Domain=');
  });

  it('wrong-password ≡ unknown-email: mismo status y misma forma de body (AUTH-02)', async () => {
    if (!ALLOW) return;

    const resWrongPassword = await request(app)
      .post('/api/auth/login')
      .set('x-api-key', API_KEY)
      .send({ email: EMAIL, password: 'password-incorrecto' })
      .expect(401);

    const resUnknownEmail = await request(app)
      .post('/api/auth/login')
      .set('x-api-key', API_KEY)
      .send({ email: 'no-existe@example.com', password: 'lo-que-sea' })
      .expect(401);

    expect(resWrongPassword.body.message).toBe(resUnknownEmail.body.message);
  });

  it('GET /api/auth/me: 401 sin sesión, 200 con cookie de sesión (AC-06)', async () => {
    if (!ALLOW) return;

    await request(app)
      .get('/api/auth/me')
      .set('x-api-key', API_KEY)
      .expect(401);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .set('x-api-key', API_KEY)
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200);
    const cookie = extraerNombreValorCookie(loginRes);

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('x-api-key', API_KEY)
      .set('Cookie', cookie)
      .expect(200);

    expect(meRes.body).toEqual({ userId, email: EMAIL });
  });

  it('transporte Bearer: mismo endpoint 200 con Authorization: Bearer <body.token>, sin cookie (AUTH-05)', async () => {
    if (!ALLOW) return;

    const loginRes = await request(app)
      .post('/api/auth/login')
      .set('x-api-key', API_KEY)
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200);

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('x-api-key', API_KEY)
      .set('Authorization', `Bearer ${loginRes.body.token}`)
      .expect(200);

    expect(meRes.body).toEqual({ userId, email: EMAIL });
  });

  it('precedencia de cookie: cookie válida + Bearer basura → sigue funcionando (usa la cookie, AUTH-05)', async () => {
    if (!ALLOW) return;

    const loginRes = await request(app)
      .post('/api/auth/login')
      .set('x-api-key', API_KEY)
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200);
    const cookie = extraerNombreValorCookie(loginRes);

    await request(app)
      .get('/api/auth/me')
      .set('x-api-key', API_KEY)
      .set('Cookie', cookie)
      .set('Authorization', 'Bearer token-basura-invalido')
      .expect(200);
  });

  it('logout limpia la cookie y revoca la fila; una segunda sesión (Y) sigue funcionando (AUTH-07)', async () => {
    if (!ALLOW) return;

    const loginX = await request(app)
      .post('/api/auth/login')
      .set('x-api-key', API_KEY)
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200);
    const cookieX = extraerNombreValorCookie(loginX);

    const loginY = await request(app)
      .post('/api/auth/login')
      .set('x-api-key', API_KEY)
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200);
    const cookieY = extraerNombreValorCookie(loginY);

    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('x-api-key', API_KEY)
      .set('Cookie', cookieX)
      .expect(204);
    const clearedCookie = logoutRes.headers['set-cookie'] as unknown as string[];
    expect(clearedCookie[0]).toContain('Max-Age=0');

    // Sesión X revocada
    await request(app)
      .get('/api/auth/me')
      .set('x-api-key', API_KEY)
      .set('Cookie', cookieX)
      .expect(401);

    // Sesión Y sigue viva (multi-sesión preservada)
    await request(app)
      .get('/api/auth/me')
      .set('x-api-key', API_KEY)
      .set('Cookie', cookieY)
      .expect(200);
  });
});
