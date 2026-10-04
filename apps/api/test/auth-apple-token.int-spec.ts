/**
 * Integration tests for the real POST /api/auth/apple/token flow:
 * `LoginConAppleUseCase` + `PrismaIdentidadAppleRepository` +
 * `PrismaSessionRepository` against a REAL Postgres, through the actual HTTP
 * route. The identity-token verifier is a double (never live Apple; its own
 * cryptography is covered by `apple-id-token.adapter.spec.ts`) — everything
 * downstream of the verified identity (linking, signup, catalog copy, session)
 * is real.
 *
 * Requires a real DB. Run via `pnpm api test:integration` (sets
 * ALLOW_DESTRUCTIVE_DB=1) — see apps/api/docs/local-test-db.md.
 */
import request from 'supertest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createApp } from '../src/infrastructure/http-express/app';
import { createContainer } from '../src/composition/container';
import type { AppleAuthGraph } from '../src/composition/crear-auth-apple';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';
import { loadEnv } from '../src/config/env';
import { Result } from '../src/shared/result';
import { LoginConAppleUseCase } from '../src/application/use-cases/login-con-apple.use-case';
import { PrismaIdentidadAppleRepository } from '../src/infrastructure/persistence/prisma-identidad-apple.repository';
import { PrismaSessionRepository } from '../src/infrastructure/persistence/prisma-session.repository';
import { Sha256SessionTokenService } from '../src/infrastructure/http/auth/sha256-session-token.service';
import { SystemReloj } from '../src/infrastructure/http/auth/system-reloj';
import { IpRateLimiter } from '../src/infrastructure/http/auth/ip-rate-limiter';
import { HmacBlindIndexService } from '../src/infrastructure/persistence/hmac-blind-index.service';
import { AesGcmCryptoService } from '../src/infrastructure/persistence/aes-gcm-crypto.service';
import { CATEGORIA_TEMPLATE_SIZE } from '../src/infrastructure/persistence/catalogo-template';
import { deriveBlindIndexKey } from '../src/composition/derive-blind-index-key';
import { buildEncryptedEmailFields } from './support/encrypted-email.fixture';
import { NoOpLogger } from './support/logger.double';
import type { IdentidadApple } from '../src/application/ports/verificador-identidad-apple.port';

const ALLOW = process.env.ALLOW_DESTRUCTIVE_DB === '1';
const API_KEY = process.env.API_KEY ?? '';
const RUN_ID = `auth-apple-token-int-${Date.now()}`;
const BODY = { identityToken: 'fake.identity.token', nonce: 'nonce-crudo' };
const GENERIC_401 = { message: 'Credenciales inválidas.' };

describe('POST /api/auth/apple/token (int) — LoginConAppleUseCase against a real DB', () => {
  let prisma: PrismaClient;
  let appSinApple: Express;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    if (!ALLOW) return;

    const env = loadEnv();
    prisma = createPrismaClient(env);
    await prisma.$connect();
    appSinApple = createApp(createContainer(env, prisma), env);
  });

  afterAll(async () => {
    if (!ALLOW) return;

    // Cleanup NO depende de que cada test haya llegado a registrar su userId:
    // un assert que falla antes del `push` (p. ej. la carrera) dejaría un
    // usuario con su catálogo copiado en la BD compartida y contaminaría los
    // specs posteriores (seed.int-spec cuenta patrones globales). Se barre
    // además todo usuario cuyo appleSub lleve el prefijo de ESTA corrida.
    const porPrefijo = await prisma.user.findMany({
      where: { appleSub: { startsWith: `sub-${RUN_ID}` } },
      select: { id: true },
    });
    const ids = [
      ...new Set([...createdUserIds, ...porPrefijo.map((u) => u.id)]),
    ];

    if (ids.length > 0) {
      await prisma.session.deleteMany({ where: { userId: { in: ids } } });
      await prisma.patronClasificacion.deleteMany({
        where: { userId: { in: ids } },
      });
      await prisma.categoria.deleteMany({ where: { userId: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.$disconnect();
  });

  function appConIdentidad(identidad: IdentidadApple): Express {
    const env = loadEnv();
    const clave = Buffer.from(env.ENCRYPTION_KEY, 'base64');
    const loginConApple = new LoginConAppleUseCase(
      new PrismaIdentidadAppleRepository(
        prisma,
        new HmacBlindIndexService(deriveBlindIndexKey(clave)),
        new AesGcmCryptoService(clave),
      ),
      new PrismaSessionRepository(prisma),
      new Sha256SessionTokenService(),
      new SystemReloj(),
      new NoOpLogger(),
    );
    const appleAuth: AppleAuthGraph = {
      verificadorIdToken: {
        verificarIdToken: vi.fn().mockResolvedValue(Result.ok(identidad)),
      },
      loginConApple,
      appleTokenRateLimiter: new IpRateLimiter(
        `apple-token:ip:${RUN_ID}:${identidad.sub}:`,
        1000,
        900_000,
      ),
    };

    return createApp({ ...createContainer(env, prisma), appleAuth }, env);
  }

  async function crearUsuario(data: {
    emailRaw: string;
    appleSub?: string | null;
  }): Promise<string> {
    const fields = buildEncryptedEmailFields(data.emailRaw, loadEnv());
    const user = await prisma.user.create({
      data: {
        nombre: 'Int Spec User',
        email: fields.email,
        emailBlindIndex: fields.emailBlindIndex,
        appleSub: data.appleSub ?? null,
      },
    });
    createdUserIds.push(user.id);
    return user.id;
  }

  const post = (app: Express, body: object = BODY) =>
    request(app)
      .post('/api/auth/apple/token')
      .set('x-api-key', API_KEY)
      .send(body);

  it('alta (primera autorización): usuario passwordless con el nombre del body, email cifrado, catálogo y Session real', async () => {
    if (!ALLOW) return;

    const email = `${RUN_ID}-signup@example.com`;
    const sub = `sub-${RUN_ID}-signup`;

    const res = await post(
      appConIdentidad({
        sub,
        email,
        emailVerificado: true,
        emailPrivado: false,
      }),
      { ...BODY, nombre: 'Ana Pérez' },
    );

    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']).toBeUndefined();
    const userId: string = res.body.userId;
    createdUserIds.push(userId);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    expect(user?.appleSub).toBe(sub);
    expect(user?.passwordHash).toBeNull();
    expect(user?.nombre).toBe('Ana Pérez');
    expect(user?.email).not.toBe(email);
    expect(user?.emailBlindIndex).not.toBeNull();
    expect(await prisma.categoria.count({ where: { userId } })).toBe(
      CATEGORIA_TEMPLATE_SIZE,
    );
    expect(await prisma.session.count({ where: { userId } })).toBe(1);
  });

  it('login posterior: el token ya no trae email → resuelve por appleSub, misma cuenta, sin duplicar', async () => {
    if (!ALLOW) return;

    const sub = `sub-${RUN_ID}-relogin`;
    const userId = await crearUsuario({
      emailRaw: `${RUN_ID}-relogin@example.com`,
      appleSub: sub,
    });

    const res = await post(
      appConIdentidad({
        sub,
        email: null,
        emailVerificado: false,
        emailPrivado: false,
      }),
    );

    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(userId);
  });

  it('email real verificado de una cuenta existente → enlaza el appleSub a esa cuenta', async () => {
    if (!ALLOW) return;

    const email = `${RUN_ID}-link@example.com`;
    const sub = `sub-${RUN_ID}-link`;
    const userId = await crearUsuario({ emailRaw: email });

    const res = await post(
      appConIdentidad({
        sub,
        email,
        emailVerificado: true,
        emailPrivado: false,
      }),
    );

    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(userId);
    expect(
      (await prisma.user.findUnique({ where: { id: userId } }))?.appleSub,
    ).toBe(sub);
  });

  it('relay privado: NO se enlaza a la cuenta existente, se crea una distinta', async () => {
    if (!ALLOW) return;

    const existente = await crearUsuario({
      emailRaw: `${RUN_ID}-relay-target@example.com`,
    });
    const sub = `sub-${RUN_ID}-relay`;

    const res = await post(
      appConIdentidad({
        sub,
        email: `${RUN_ID}@privaterelay.appleid.com`,
        emailVerificado: true,
        emailPrivado: true,
      }),
    );

    expect(res.status).toBe(200);
    createdUserIds.push(res.body.userId);
    expect(res.body.userId).not.toBe(existente);
    expect(
      (await prisma.user.findUnique({ where: { id: existente } }))?.appleSub,
    ).toBeNull();
    expect(
      (await prisma.user.findUnique({ where: { id: res.body.userId } }))
        ?.nombre,
    ).toBe('Usuario');
  });

  it('email de una cuenta con OTRO appleSub (anti-takeover) → 401 genérico, el appleSub almacenado no cambia', async () => {
    if (!ALLOW) return;

    const email = `${RUN_ID}-takeover@example.com`;
    const existente = `sub-${RUN_ID}-existing`;
    const userId = await crearUsuario({ emailRaw: email, appleSub: existente });

    const res = await post(
      appConIdentidad({
        sub: `sub-${RUN_ID}-attacker`,
        email,
        emailVerificado: true,
        emailPrivado: false,
      }),
    );

    expect(res.status).toBe(401);
    expect(res.body).toEqual(GENERIC_401);
    expect(
      (await prisma.user.findUnique({ where: { id: userId } }))?.appleSub,
    ).toBe(existente);
  });

  it('cuenta nueva SIN email → 401 genérico y no se crea ninguna fila', async () => {
    if (!ALLOW) return;

    const sub = `sub-${RUN_ID}-noemail`;

    const res = await post(
      appConIdentidad({
        sub,
        email: null,
        emailVerificado: false,
        emailPrivado: false,
      }),
    );

    expect(res.status).toBe(401);
    expect(res.body).toEqual(GENERIC_401);
    expect(await prisma.user.count({ where: { appleSub: sub } })).toBe(0);
  });

  it('dos altas concurrentes de la misma identidad → una sola cuenta, ambas con sesión', async () => {
    if (!ALLOW) return;

    const sub = `sub-${RUN_ID}-race`;
    const app = appConIdentidad({
      sub,
      email: `${RUN_ID}-race@example.com`,
      emailVerificado: true,
      emailPrivado: false,
    });

    const [a, b] = await Promise.all([post(app), post(app)]);

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body.userId).toBe(b.body.userId);
    createdUserIds.push(a.body.userId);
    expect(await prisma.user.count({ where: { appleSub: sub } })).toBe(1);
  });

  it('404 cuando el container no tiene appleAuth (feature apagada)', async () => {
    if (!ALLOW) return;

    const res = await post(appSinApple);

    expect(res.status).toBe(404);
  });
});
