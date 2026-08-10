/**
 * Integration test for the real GET /api/auth/google/callback flow (Slice
 * C2, design §11.3): the ONLY end-to-end coverage of
 * `LoginConGoogleUseCase` + `PrismaIdentidadGoogleRepository` +
 * `PrismaSessionRepository` wired together against a REAL Postgres, through
 * the actual HTTP route. Never talks to live Google — `verificador` is a
 * double, per design ("never live Google, per ADR-034's consequences").
 * Everything downstream of the verified identity (session issuance, linking)
 * is real.
 *
 * Requires a real DB. Run via `pnpm api test:integration` (sets
 * ALLOW_DESTRUCTIVE_DB=1) — see apps/api/docs/local-test-db.md.
 */
import request from 'supertest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createApp } from '../src/infrastructure/http-express/app';
import { createContainer, type Container } from '../src/composition/container';
import type { GoogleAuthGraph } from '../src/composition/crear-auth-google';
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
import { serializeOauthCookie } from '../src/infrastructure/http/auth/oauth-transient-cookie';
import { buildEncryptedEmailFields } from './support/encrypted-email.fixture';
import { NoOpLogger } from './support/logger.double';
import type {
  IdentidadExterna,
  IIniciadorLoginExterno,
  IVerificadorIdentidadExterna,
} from '../src/application/ports/verificador-identidad-externa.port';

const ALLOW = process.env.ALLOW_DESTRUCTIVE_DB === '1';
const API_KEY = process.env.API_KEY ?? '';
const REDIRECT_URI = 'https://app.moneydiary.cl/api/auth/google/callback';

const RUN_ID = `auth-google-callback-int-${Date.now()}`;
const EMAIL = `${RUN_ID}@example.com`;
const GOOGLE_SUB = `google-sub-${RUN_ID}`;
const OAUTH_STATE = { state: 's1', nonce: 'n1', codeVerifier: 'v1' };

/** Restores a self-provisioned `process.env` var to its prior value (or unsets it). */
function restoreEnvVar(name: string, previous: string | undefined): void {
  if (previous === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = previous;
  }
}

describe('GET /api/auth/google/callback (int) — LoginConGoogleUseCase against a real DB', () => {
  let app: Express;
  let prisma: PrismaClient;
  let userId: string;
  let fakeVerificador: { verificar: ReturnType<typeof vi.fn> };
  let previousGoogleEnv: {
    clientId: string | undefined;
    clientSecret: string | undefined;
    redirectUri: string | undefined;
  };

  beforeAll(async () => {
    if (!ALLOW) return;

    // Self-provision the three GOOGLE_* env vars this spec needs (4R R3
    // BLOCKER): CI's `integration` job never sets any GOOGLE_* var, and this
    // spec builds its OWN `GoogleAuthGraph` (see below) rather than relying
    // on `crearAuthGoogle`, so it must not depend on external configuration
    // to run — locally OR in CI. `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`
    // are never used for a real network call: `verificador` is a double
    // (never live Google) and `iniciador` is a stub, so any non-empty
    // placeholder value is safe here. Saved/restored around the suite so a
    // future spec running in the same process never inherits them.
    previousGoogleEnv = {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      redirectUri: process.env.GOOGLE_REDIRECT_URI,
    };
    process.env.GOOGLE_CLIENT_ID = 'int-spec-google-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'int-spec-google-client-secret';
    process.env.GOOGLE_REDIRECT_URI = REDIRECT_URI;

    const env = loadEnv();
    // `app.ts` reads `env.GOOGLE_REDIRECT_URI!` regardless of how
    // `container.googleAuth` was built — this spec's env MUST set it, or
    // the callback route throws building the (unused, since verificador is
    // a double) urlCallback. Fail loud with a clear message instead of the
    // opaque TypeError this would otherwise produce mid-request.
    if (env.GOOGLE_REDIRECT_URI !== REDIRECT_URI) {
      throw new Error(
        `Este spec requiere GOOGLE_REDIRECT_URI="${REDIRECT_URI}" en el entorno de test.`,
      );
    }

    prisma = createPrismaClient(env);
    await prisma.$connect();

    const { email, emailBlindIndex } = buildEncryptedEmailFields(EMAIL, env);
    const user = await prisma.user.create({
      data: {
        nombre: 'E2E Google User',
        email,
        emailBlindIndex,
        googleSub: null,
      },
    });
    userId = user.id;

    // La app real (createContainer) NO tiene googleAuth definido en este
    // entorno de test (P2 — las credenciales de Google no se setean hasta
    // que C2 mergea). Este spec construye su PROPIO GoogleAuthGraph: mismos
    // colaboradores de persistencia REALES que crearAuthGoogle usaría
    // (misma instancia de blindIndex derivada de env.ENCRYPTION_KEY, design
    // §5.5), pero un `verificador` DOBLE — nunca live Google.
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
      new NoOpLogger(),
    );

    fakeVerificador = {
      verificar: vi.fn().mockResolvedValue(
        Result.ok<IdentidadExterna>({
          sub: GOOGLE_SUB,
          email: EMAIL,
          emailVerificado: true,
        }),
      ),
    };
    const fakeIniciador: IIniciadorLoginExterno = { iniciar: vi.fn() };

    const googleAuth: GoogleAuthGraph = {
      iniciador: fakeIniciador,
      verificador: fakeVerificador as unknown as IVerificadorIdentidadExterna,
      loginConGoogle,
      // Presupuesto generoso (nunca 429 en este spec) — el rate limiting
      // en sí ya está cubierto en auth-google.routes.spec.ts.
      googleRateLimiter: new IpRateLimiter(
        `google:ip:${RUN_ID}:`,
        1000,
        900_000,
      ),
    };

    const baseContainer: Container = createContainer(env, prisma);
    const container: Container = { ...baseContainer, googleAuth };

    app = createApp(container, env);
  });

  afterAll(async () => {
    if (!ALLOW) return;

    await prisma.session.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();

    restoreEnvVar('GOOGLE_CLIENT_ID', previousGoogleEnv.clientId);
    restoreEnvVar('GOOGLE_CLIENT_SECRET', previousGoogleEnv.clientSecret);
    restoreEnvVar('GOOGLE_REDIRECT_URI', previousGoogleEnv.redirectUri);
  });

  function oauthCookieHeader(): string {
    return serializeOauthCookie(OAUTH_STATE, false).split(';')[0];
  }

  it('primer login: linkea googleSub + emite una Session real (SHA-256, expiresAt = creación + 7d, indistinguible de password login) — AUTH-13/14', async () => {
    if (!ALLOW) return;

    const before = await prisma.session.count();

    const res = await request(app)
      .get('/api/auth/google/callback')
      .query({ code: 'fake-code', state: OAUTH_STATE.state })
      .set('x-api-key', API_KEY)
      .set('Cookie', oauthCookieHeader());

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');

    const setCookie = res.headers['set-cookie'] as unknown as string[];
    const sessionCookieLine = setCookie.find((c) =>
      c.startsWith('md_session='),
    );
    expect(sessionCookieLine).toBeDefined();
    expect(sessionCookieLine).toContain('HttpOnly');
    expect(sessionCookieLine).toContain('SameSite=Strict');
    const token = sessionCookieLine!.split(';')[0].split('=')[1];

    // El link efectivamente pasó (design §5.3 paso 2).
    const linkedUser = await prisma.user.findUnique({ where: { id: userId } });
    expect(linkedUser?.googleSub).toBe(GOOGLE_SUB);

    // Fila de Session REAL, byte-idéntica en forma a la que emite el login
    // por password (AUTH-13): hash SHA-256 (64 hex chars), expiresAt a
    // creación + 7 días exactos.
    const sessions = await prisma.session.findMany({ where: { userId } });
    expect(sessions).toHaveLength(1);
    const session = sessions[0];
    expect(session.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(session.tokenHash).not.toBe(token); // nunca el token crudo persistido

    // `expiresAt` viene de `reloj.ahora()` (Node); `creadoEn` viene de
    // `now()` de Postgres (`@default(now())`) — dos relojes distintos con un
    // pequeño desfase esperable entre el cálculo en memoria y el INSERT.
    // Se tolera hasta 5s de skew, se exige el TTL de 7 días exacto (AUTH-13).
    const ttlMs = session.expiresAt.getTime() - session.creadoEn.getTime();
    expect(Math.abs(ttlMs - 7 * 24 * 60 * 60 * 1000)).toBeLessThan(5_000);

    expect(await prisma.session.count()).toBe(before + 1);
  });

  it('segundo login (mismo sub, ya linkeado): resuelve por googleSub, sin re-link, nueva Session (AUTH-14 "existing googleSub match")', async () => {
    if (!ALLOW) return;

    fakeVerificador.verificar.mockClear();
    const before = await prisma.session.count();

    const res = await request(app)
      .get('/api/auth/google/callback')
      .query({ code: 'fake-code-2', state: OAUTH_STATE.state })
      .set('x-api-key', API_KEY)
      .set('Cookie', oauthCookieHeader());

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');
    expect(await prisma.session.count()).toBe(before + 1);

    const linkedUser = await prisma.user.findUnique({ where: { id: userId } });
    expect(linkedUser?.googleSub).toBe(GOOGLE_SUB); // sin cambios, ya estaba linkeado
  });
});
