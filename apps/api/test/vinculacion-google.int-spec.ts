/**
 * Integration test for the explicit Google link flow (US-041, design §6.3/
 * §6.4): `POST /api/perfil/google/vincular` + `GET /api/auth/google/callback`
 * (link mode) wired against a REAL Postgres, through the actual HTTP routes.
 * Never talks to live Google — `verificador`/`iniciador` are doubles (same
 * "never live Google" posture as `auth-google-callback.int-spec.ts`).
 * `iniciarVinculacion`/`vincularGoogle`/`linkIntentKey` are the REAL
 * instances `createContainer` builds — real password verification, real
 * link-intent MAC derived exactly as production does.
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
import { Argon2PasswordHasher } from '../src/infrastructure/http/auth/argon2-password-hasher';
import { IpRateLimiter } from '../src/infrastructure/http/auth/ip-rate-limiter';
import { firmarLinkIntent } from '../src/infrastructure/http/auth/link-intent';
import {
  serializeOauthCookie,
  parseOauthCookie,
} from '../src/infrastructure/http/auth/oauth-transient-cookie';
import { buildEncryptedEmailFields } from './support/encrypted-email.fixture';
import { crearSesionParaUsuario } from './support/session.fixture';
import type {
  IdentidadExterna,
  IIniciadorLoginExterno,
  IVerificadorIdentidadExterna,
} from '../src/application/ports/verificador-identidad-externa.port';

const ALLOW = process.env.ALLOW_DESTRUCTIVE_DB === '1';
const API_KEY = process.env.API_KEY ?? '';
const REDIRECT_URI = 'https://app.moneydiary.cl/api/auth/google/callback';
const PASSWORD = 'password-de-prueba-us041'; // gitleaks:allow — fixture de test, no es un secreto

const RUN_ID = `vinculacion-google-int-${Date.now()}`;
const EMAIL_A = `${RUN_ID}-a@example.com`;
const EMAIL_B = `${RUN_ID}-b@example.com`;
const GOOGLE_SUB_A = `google-sub-a-${RUN_ID}`;
const GOOGLE_SUB_B = `google-sub-b-${RUN_ID}`;

/** Restores a self-provisioned `process.env` var to its prior value (or unsets it). */
function restoreEnvVar(name: string, previous: string | undefined): void {
  if (previous === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = previous;
  }
}

/** Row snapshot mínimo para las pruebas byte-idénticas de los binding proofs. */
async function snapshotUser(
  prisma: PrismaClient,
  userId: string,
): Promise<Record<string, unknown>> {
  return prisma.user.findUniqueOrThrow({ where: { id: userId } });
}

/**
 * `iniciarVinculacion` usa el adapter OIDC REAL (`crearAuthGoogle` lo
 * construye internamente, independiente del `iniciador`/`verificador`
 * inyectados en `GoogleAuthGraph` — ver docblock del archivo) — así que
 * `state` es GENUINAMENTE aleatorio en cada `iniciar()`, nunca el valor fijo
 * que devuelve `fakeIniciador`. El query `state` del replay tiene que leerse
 * de la cookie real, no asumirse.
 */
function estadoDeCookie(oauthCookieHeader: string): string {
  const parsed = parseOauthCookie(oauthCookieHeader);
  if (parsed === undefined) {
    throw new Error('Cookie md_oauth inesperadamente no parseable en el test.');
  }
  return parsed.state;
}

describe('POST /api/perfil/google/vincular + GET /api/auth/google/callback (link) — int', () => {
  let app: Express;
  let prisma: PrismaClient;
  let userIdA: string;
  let userIdB: string;
  let userIdDemo: string;
  let authA: string;
  let authDemo: string;
  let fakeVerificador: { verificar: ReturnType<typeof vi.fn> };
  let realGoogleAuth: GoogleAuthGraph;
  let previousGoogleEnv: {
    clientId: string | undefined;
    clientSecret: string | undefined;
    redirectUri: string | undefined;
  };

  beforeAll(async () => {
    if (!ALLOW) return;

    // Self-provision (4R R3 BLOCKER, mismo patrón que auth-google-callback.int-spec.ts):
    // CI's integration job never sets any GOOGLE_* var.
    previousGoogleEnv = {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      redirectUri: process.env.GOOGLE_REDIRECT_URI,
    };
    process.env.GOOGLE_CLIENT_ID = 'int-spec-google-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'int-spec-google-client-secret';
    process.env.GOOGLE_REDIRECT_URI = REDIRECT_URI;

    const env = loadEnv();
    prisma = createPrismaClient(env);
    await prisma.$connect();

    const passwordHash = await new Argon2PasswordHasher().hash(PASSWORD);

    const userA = await prisma.user.create({
      data: {
        nombre: `Vinculacion A ${RUN_ID}`,
        ...buildEncryptedEmailFields(EMAIL_A, env),
        passwordHash,
        googleSub: null,
      },
    });
    userIdA = userA.id;

    const userB = await prisma.user.create({
      data: {
        nombre: `Vinculacion B ${RUN_ID}`,
        ...buildEncryptedEmailFields(EMAIL_B, env),
        passwordHash,
        googleSub: GOOGLE_SUB_B,
      },
    });
    userIdB = userB.id;

    const userDemo = await prisma.user.create({
      data: {
        nombre: `Vinculacion Demo ${RUN_ID}`,
        esDemo: true,
      },
    });
    userIdDemo = userDemo.id;

    const sessionA = await crearSesionParaUsuario(prisma, userIdA);
    authA = `Bearer ${sessionA.token}`;
    const sessionDemo = await crearSesionParaUsuario(prisma, userIdDemo);
    authDemo = `Bearer ${sessionDemo.token}`;

    // La app real: iniciarVinculacion/vincularGoogle/linkIntentKey son las
    // instancias REALES que createContainer construye (real password
    // verification, real derived key) — solo iniciador/verificador se
    // reemplazan por dobles (nunca live Google).
    const baseContainer: Container = createContainer(env, prisma);
    realGoogleAuth = baseContainer.googleAuth!;

    const fakeIniciador: IIniciadorLoginExterno = {
      iniciar: vi.fn().mockResolvedValue(
        Result.ok({
          urlAutorizacion: 'https://accounts.google.com/o/oauth2/v2/auth?x=1',
          state: `${RUN_ID}-state`,
          nonce: `${RUN_ID}-nonce`,
          codeVerifier: `${RUN_ID}-verifier`,
        }),
      ),
    };
    fakeVerificador = {
      verificar: vi.fn().mockResolvedValue(
        Result.ok<IdentidadExterna>({
          sub: GOOGLE_SUB_A,
          email: null,
          emailVerificado: true,
        }),
      ),
    };

    const googleAuth: GoogleAuthGraph = {
      ...realGoogleAuth,
      iniciador: fakeIniciador,
      verificador: fakeVerificador as unknown as IVerificadorIdentidadExterna,
      // Presupuesto generoso — el rate limiting en sí ya está cubierto en
      // perfil-google.routes.spec.ts / auth-google.routes.spec.ts.
      googleRateLimiter: new IpRateLimiter(
        `google:ip:${RUN_ID}:`,
        1000,
        900_000,
      ),
    };

    const container: Container = { ...baseContainer, googleAuth };
    app = createApp(container, env);
  });

  afterAll(async () => {
    if (!ALLOW) return;

    await prisma.session.deleteMany({
      where: { userId: { in: [userIdA, userIdB, userIdDemo] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [userIdA, userIdB, userIdDemo] } },
    });
    await prisma.$disconnect();

    restoreEnvVar('GOOGLE_CLIENT_ID', previousGoogleEnv.clientId);
    restoreEnvVar('GOOGLE_CLIENT_SECRET', previousGoogleEnv.clientSecret);
    restoreEnvVar('GOOGLE_REDIRECT_URI', previousGoogleEnv.redirectUri);
  });

  it('VINC041-01: sesión no-demo + password correcta ⇒ 200 { urlAutorizacion } + Set-Cookie md_oauth con Path/HttpOnly/SameSite/Max-Age correctos (design §6.4, guard note #9)', async () => {
    if (!ALLOW) return;

    const res = await request(app)
      .post('/api/perfil/google/vincular')
      .set('x-api-key', API_KEY)
      .set('Authorization', authA)
      .send({ passwordActual: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.urlAutorizacion).toBeDefined();

    const setCookie = res.headers['set-cookie'] as unknown as string[];
    const oauthCookieLine = setCookie.find((c) => c.startsWith('md_oauth='));
    expect(oauthCookieLine).toBeDefined();
    expect(oauthCookieLine).toContain('Path=/api/auth/google');
    expect(oauthCookieLine).toContain('HttpOnly');
    expect(oauthCookieLine).toContain('SameSite=Lax');
    expect(oauthCookieLine).toContain('Max-Age=600');
  });

  it('VINC041-01: password incorrecta ⇒ 403 PERFIL_RECHAZADO, SIN Set-Cookie en absoluto, fila sin cambios', async () => {
    if (!ALLOW) return;

    const before = await snapshotUser(prisma, userIdA);

    const res = await request(app)
      .post('/api/perfil/google/vincular')
      .set('x-api-key', API_KEY)
      .set('Authorization', authA)
      .send({ passwordActual: 'incorrecta' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PERFIL_RECHAZADO');
    expect(res.headers['set-cookie']).toBeUndefined();

    expect(await snapshotUser(prisma, userIdA)).toEqual(before);
  });

  it('VINC041-07: sesión demo ⇒ 403 DEMO_SOLO_LECTURA, nada escrito', async () => {
    if (!ALLOW) return;

    const before = await snapshotUser(prisma, userIdDemo);

    const res = await request(app)
      .post('/api/perfil/google/vincular')
      .set('x-api-key', API_KEY)
      .set('Authorization', authDemo)
      .send({ passwordActual: 'lo que sea' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('DEMO_SOLO_LECTURA');

    const setCookie = [res.headers['set-cookie']].flat();
    expect(setCookie.some((c) => c?.startsWith('md_oauth='))).toBe(false);

    expect(await snapshotUser(prisma, userIdDemo)).toEqual(before);
  });

  describe('★ BINDING PROOF (a) — un link forjado escribe NADA y no loguea a nadie', () => {
    it('link.userId swapped a otra cuenta (mac firmado para A, presentado reclamando B) ⇒ 302 /login?error=google, sin md_session, AMBAS filas byte-idénticas', async () => {
      if (!ALLOW) return;

      const state = `${RUN_ID}-forged-state-1`;
      const macDeA = firmarLinkIntent(
        realGoogleAuth.linkIntentKey,
        state,
        userIdA,
      ).mac;
      const cookie = serializeOauthCookie(
        {
          state,
          nonce: 'n',
          codeVerifier: 'v',
          link: { userId: userIdB, mac: macDeA },
        },
        false,
      ).split(';')[0];

      const beforeA = await snapshotUser(prisma, userIdA);
      const beforeB = await snapshotUser(prisma, userIdB);

      const res = await request(app)
        .get('/api/auth/google/callback')
        .query({ code: 'fake-code', state })
        .set('x-api-key', API_KEY)
        .set('Cookie', cookie);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/login?error=google');
      const setCookie = [res.headers['set-cookie']].flat();
      expect(setCookie.some((c) => c?.startsWith('md_session='))).toBe(false);

      expect(await snapshotUser(prisma, userIdA)).toEqual(beforeA);
      expect(await snapshotUser(prisma, userIdB)).toEqual(beforeB);
    });

    it('mac computado sobre un state DISTINTO (cross-flow replay) ⇒ 302 /login?error=google, sin md_session, filas sin cambios', async () => {
      if (!ALLOW) return;

      const stateReal = `${RUN_ID}-forged-state-2`;
      const macDeOtroFlujo = firmarLinkIntent(
        realGoogleAuth.linkIntentKey,
        `${RUN_ID}-otro-flujo-completamente-distinto`,
        userIdA,
      ).mac;
      const cookie = serializeOauthCookie(
        {
          state: stateReal,
          nonce: 'n',
          codeVerifier: 'v',
          link: { userId: userIdA, mac: macDeOtroFlujo },
        },
        false,
      ).split(';')[0];

      const before = await snapshotUser(prisma, userIdA);

      const res = await request(app)
        .get('/api/auth/google/callback')
        .query({ code: 'fake-code', state: stateReal })
        .set('x-api-key', API_KEY)
        .set('Cookie', cookie);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/login?error=google');
      const setCookie = [res.headers['set-cookie']].flat();
      expect(setCookie.some((c) => c?.startsWith('md_session='))).toBe(false);

      expect(await snapshotUser(prisma, userIdA)).toEqual(before);
    });

    it('link presente con mac: "" (ausente/vacío) ⇒ 302 /login?error=google, sin md_session, fila sin cambios', async () => {
      if (!ALLOW) return;

      const state = `${RUN_ID}-forged-state-3`;
      const cookie = serializeOauthCookie(
        {
          state,
          nonce: 'n',
          codeVerifier: 'v',
          link: { userId: userIdA, mac: '' },
        },
        false,
      ).split(';')[0];

      const before = await snapshotUser(prisma, userIdA);

      const res = await request(app)
        .get('/api/auth/google/callback')
        .query({ code: 'fake-code', state })
        .set('x-api-key', API_KEY)
        .set('Cookie', cookie);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/login?error=google');
      const setCookie = [res.headers['set-cookie']].flat();
      expect(setCookie.some((c) => c?.startsWith('md_session='))).toBe(false);

      expect(await snapshotUser(prisma, userIdA)).toEqual(before);
    });
  });

  it('VINC041-03: flujo feliz completo — initiate → replay de la cookie en el callback (verificador faked) ⇒ 302 /configuracion?google=vinculado, googleSub escrito en la fila de A, NINGUNA Session creada', async () => {
    if (!ALLOW) return;

    const sessionCountBefore = await prisma.session.count();

    const initiate = await request(app)
      .post('/api/perfil/google/vincular')
      .set('x-api-key', API_KEY)
      .set('Authorization', authA)
      .send({ passwordActual: PASSWORD });

    expect(initiate.status).toBe(200);
    const setCookie = initiate.headers['set-cookie'] as unknown as string[];
    const oauthCookieHeader = setCookie
      .find((c) => c.startsWith('md_oauth='))!
      .split(';')[0];

    const callback = await request(app)
      .get('/api/auth/google/callback')
      // El fakeIniciador SIEMPRE devuelve el mismo state fijo — coincide con
      // el query param que el navegador real reenviaría.
      .query({ code: 'fake-code', state: estadoDeCookie(oauthCookieHeader) })
      .set('x-api-key', API_KEY)
      .set('Cookie', oauthCookieHeader);

    expect(callback.status).toBe(302);
    expect(callback.headers.location).toBe('/configuracion?google=vinculado');
    const callbackCookies = [callback.headers['set-cookie']].flat();
    expect(callbackCookies.some((c) => c?.startsWith('md_session='))).toBe(
      false,
    );

    const linkedUser = await prisma.user.findUniqueOrThrow({
      where: { id: userIdA },
    });
    expect(linkedUser.googleSub).toBe(GOOGLE_SUB_A);

    expect(await prisma.session.count()).toBe(sessionCountBefore);
  });

  it('VINC041-04: idempotente — re-link del MISMO sub ⇒ 302 …vinculado, fila sin cambios', async () => {
    if (!ALLOW) return;

    // A ya quedó linkeada a GOOGLE_SUB_A por la prueba anterior (VINC041-03)
    // — por eso el pre-flight 409 de IniciarVinculacionGoogleUseCase bloquea
    // un segundo POST /vincular real (es exactamente el control correcto,
    // no un bug de este test). La idempotencia que VINC041-04 prueba vive en
    // VincularGoogleUseCase, en el CALLBACK — así que el intent firmado se
    // construye DIRECTO (mismo patrón que los binding proofs), sin pasar por
    // el endpoint de iniciación.
    const state = `${RUN_ID}-idempotent-state`;
    const link = firmarLinkIntent(realGoogleAuth.linkIntentKey, state, userIdA);
    const cookie = serializeOauthCookie(
      { state, nonce: 'n', codeVerifier: 'v', link },
      false,
    ).split(';')[0];

    const before = await snapshotUser(prisma, userIdA);

    const callback = await request(app)
      .get('/api/auth/google/callback')
      .query({ code: 'fake-code', state })
      .set('x-api-key', API_KEY)
      .set('Cookie', cookie);

    expect(callback.status).toBe(302);
    expect(callback.headers.location).toBe('/configuracion?google=vinculado');

    expect(await snapshotUser(prisma, userIdA)).toEqual(before);
  });

  it('★ BINDING PROOF (c): user B ya posee sub-X; user C (NO linkeado) corre un link que resuelve sub-X ⇒ 302 …error, C.googleSub sigue null, fila de B byte-idéntica', async () => {
    if (!ALLOW) return;

    // Dedicado y SIN linkear — a diferencia de A (ya linkeada a GOOGLE_SUB_A
    // en VINC041-03), un usuario ya-linkeado dispararía el paso 3
    // ('ya-tiene-otro-sub') ANTES de llegar al paso 4 (★, el que este test
    // prueba) — buscarPorGoogleSub encontraría a B recién en el paso 4, que
    // solo se alcanza cuando la fila propia tiene `googleSub: null`.
    const env = loadEnv();
    const passwordHash = await new Argon2PasswordHasher().hash(PASSWORD);
    const userC = await prisma.user.create({
      data: {
        nombre: `Vinculacion C ${RUN_ID}`,
        ...buildEncryptedEmailFields(`${RUN_ID}-c@example.com`, env),
        passwordHash,
        googleSub: null,
      },
    });

    fakeVerificador.verificar.mockResolvedValueOnce(
      Result.ok<IdentidadExterna>({
        sub: GOOGLE_SUB_B,
        email: null,
        emailVerificado: true,
      }),
    );

    const state = `${RUN_ID}-collision-state`;
    const link = firmarLinkIntent(
      realGoogleAuth.linkIntentKey,
      state,
      userC.id,
    );
    const cookie = serializeOauthCookie(
      { state, nonce: 'n', codeVerifier: 'v', link },
      false,
    ).split(';')[0];

    const beforeC = await snapshotUser(prisma, userC.id);
    const beforeB = await snapshotUser(prisma, userIdB);

    const callback = await request(app)
      .get('/api/auth/google/callback')
      .query({ code: 'fake-code', state })
      .set('x-api-key', API_KEY)
      .set('Cookie', cookie);

    expect(callback.status).toBe(302);
    expect(callback.headers.location).toBe('/configuracion?google=error');

    const afterC = await snapshotUser(prisma, userC.id);
    expect(afterC.googleSub).toBeNull();
    expect(afterC).toEqual(beforeC);
    expect(await snapshotUser(prisma, userIdB)).toEqual(beforeB);

    await prisma.user.delete({ where: { id: userC.id } });
  });

  it('VINC041-06: GET /api/auth/me reporta googleVinculado false ANTES y true DESPUÉS del link', async () => {
    if (!ALLOW) return;

    // Usuario dedicado (no reutiliza A, que ya quedó linkeado en tests previos).
    const env = loadEnv();
    const passwordHash = await new Argon2PasswordHasher().hash(PASSWORD);
    const user = await prisma.user.create({
      data: {
        nombre: `Vinculacion Me ${RUN_ID}`,
        ...buildEncryptedEmailFields(`${RUN_ID}-me@example.com`, env),
        passwordHash,
        googleSub: null,
      },
    });
    const session = await crearSesionParaUsuario(prisma, user.id);
    const auth = `Bearer ${session.token}`;

    const meAntes = await request(app)
      .get('/api/auth/me')
      .set('x-api-key', API_KEY)
      .set('Authorization', auth);
    expect(meAntes.body.googleVinculado).toBe(false);

    fakeVerificador.verificar.mockResolvedValueOnce(
      Result.ok<IdentidadExterna>({
        sub: `${GOOGLE_SUB_A}-me-dedicado`,
        email: null,
        emailVerificado: true,
      }),
    );
    const initiate = await request(app)
      .post('/api/perfil/google/vincular')
      .set('x-api-key', API_KEY)
      .set('Authorization', auth)
      .send({ passwordActual: PASSWORD });
    const setCookie = initiate.headers['set-cookie'] as unknown as string[];
    const oauthCookieHeader = setCookie
      .find((c) => c.startsWith('md_oauth='))!
      .split(';')[0];

    await request(app)
      .get('/api/auth/google/callback')
      .query({ code: 'fake-code', state: estadoDeCookie(oauthCookieHeader) })
      .set('x-api-key', API_KEY)
      .set('Cookie', oauthCookieHeader);

    const meDespues = await request(app)
      .get('/api/auth/me')
      .set('x-api-key', API_KEY)
      .set('Authorization', auth);
    expect(meDespues.body.googleVinculado).toBe(true);

    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('VINC041-05: unlink feliz — 204, googleSub null; segundo unlink es idempotente (204, sin más cambios); GET /api/auth/me pasa a googleVinculado false', async () => {
    if (!ALLOW) return;

    // A ya está linkeada a GOOGLE_SUB_A desde VINC041-03 — no requiere setup.
    const linked = await snapshotUser(prisma, userIdA);
    expect(linked.googleSub).toBe(GOOGLE_SUB_A);

    const res1 = await request(app)
      .post('/api/perfil/google/desvincular')
      .set('x-api-key', API_KEY)
      .set('Authorization', authA)
      .send({ passwordActual: PASSWORD });

    expect(res1.status).toBe(204);
    expect(res1.body).toEqual({});

    const unlinked = await snapshotUser(prisma, userIdA);
    expect(unlinked.googleSub).toBeNull();

    const res2 = await request(app)
      .post('/api/perfil/google/desvincular')
      .set('x-api-key', API_KEY)
      .set('Authorization', authA)
      .send({ passwordActual: PASSWORD });

    expect(res2.status).toBe(204);
    expect(await snapshotUser(prisma, userIdA)).toEqual(unlinked);

    const me = await request(app)
      .get('/api/auth/me')
      .set('x-api-key', API_KEY)
      .set('Authorization', authA);
    expect(me.body.googleVinculado).toBe(false);
  });
});

describe('★ BINDING PROOF (b) — CA-03: un usuario sin passwordHash NUNCA queda desvinculado', () => {
  let prisma: PrismaClient;
  let app: Express;
  let userSoloGoogleId: string;
  let authSoloGoogle: string;
  const soloGoogleSub = `google-sub-solo-${RUN_ID}`;

  beforeAll(async () => {
    if (!ALLOW) return;

    const env = loadEnv();
    prisma = createPrismaClient(env);
    await prisma.$connect();
    app = createApp(createContainer(env, prisma), env);

    // Usuario solo-Google: passwordHash NULL, googleSub presente. No hay
    // flujo de producto que produzca esta fila hoy vía password (el link
    // explícito exige re-verificar la password actual, VINC041-01) — se
    // sembra directo para aislar el invariante de la superficie HTTP que lo
    // produciría, mismo patrón que el resto de los binding proofs de este
    // archivo.
    const user = await prisma.user.create({
      data: {
        nombre: `Vinculacion SoloGoogle ${RUN_ID}`,
        passwordHash: null,
        googleSub: soloGoogleSub,
      },
    });
    userSoloGoogleId = user.id;
    const session = await crearSesionParaUsuario(prisma, userSoloGoogleId);
    authSoloGoogle = `Bearer ${session.token}`;
  });

  afterAll(async () => {
    if (!ALLOW) return;

    await prisma.session.deleteMany({ where: { userId: userSoloGoogleId } });
    await prisma.user.deleteMany({ where: { id: userSoloGoogleId } });
    await prisma.$disconnect();
  });

  it('desvincular sin passwordHash ⇒ 403 VINCULO_REQUIERE_PASSWORD, googleSub SIN CAMBIOS (snapshot before/after byte-idéntico)', async () => {
    if (!ALLOW) return;

    const before = await snapshotUser(prisma, userSoloGoogleId);
    expect(before.googleSub).toBe(soloGoogleSub);
    expect(before.passwordHash).toBeNull();

    const res = await request(app)
      .post('/api/perfil/google/desvincular')
      .set('x-api-key', API_KEY)
      .set('Authorization', authSoloGoogle)
      .send({ passwordActual: 'lo-que-sea' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('VINCULO_REQUIERE_PASSWORD');

    const after = await snapshotUser(prisma, userSoloGoogleId);
    expect(after).toEqual(before);
    expect(after.googleSub).toBe(soloGoogleSub);
  });
});

describe('AUTH-16 parity — POST /api/perfil/google/vincular sin GOOGLE_CLIENT_ID (US-041, binding item #4)', () => {
  it('un container SIN GOOGLE_CLIENT_ID responde 404 (NUNCA 500) — el bug exacto que la propuesta habría dejado pasar', async () => {
    if (!ALLOW) return;

    const previous = {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    };
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;

    const env = loadEnv();
    const prisma = createPrismaClient(env);
    await prisma.$connect();

    const container = createContainer(env, prisma);
    expect(container.googleAuth).toBeUndefined();

    const app = createApp(container, env);

    const passwordHash = await new Argon2PasswordHasher().hash(PASSWORD);
    const user = await prisma.user.create({
      data: {
        nombre: `AUTH-16 parity ${RUN_ID}`,
        ...buildEncryptedEmailFields(`${RUN_ID}-auth16@example.com`, env),
        passwordHash,
        googleSub: null,
      },
    });
    const session = await crearSesionParaUsuario(prisma, user.id);

    const res = await request(app)
      .post('/api/perfil/google/vincular')
      .set('x-api-key', API_KEY)
      .set('Authorization', `Bearer ${session.token}`)
      .send({ passwordActual: PASSWORD });

    expect(res.status).toBe(404);

    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();

    restoreEnvVar('GOOGLE_CLIENT_ID', previous.clientId);
    restoreEnvVar('GOOGLE_CLIENT_SECRET', previous.clientSecret);
  });
});
