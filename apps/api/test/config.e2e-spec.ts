/**
 * E2E tests for GET /api/config (#116, ADR-005 §4.5).
 *
 * Builds the real container and app from env, the same way the other e2e
 * specs do. The endpoint reads no user data — no rows are seeded.
 *
 * Covered scenarios:
 *   - 401 without x-api-key (global api-key gate), 200 without a session
 *   - defaults shape (nobody forced, free plan PLA-01, no flags)
 *   - CFG-02 acceptance: a minimum above the installed version → actualizacionRequerida=true
 *   - equal/greater version → false; missing or junk headers → null (never 400)
 *   - values come from the API configuration (env), not from the code
 */
import request from 'supertest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createApp } from '../src/infrastructure/http-express/app';
import { createContainer } from '../src/composition/container';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';
import { loadEnv } from '../src/config/env';
import { configResponseSchema } from '../src/infrastructure/http-express/schemas/config.schema';

const API_KEY = process.env.API_KEY ?? '';

describe('GET /api/config (e2e)', () => {
  const prismas: PrismaClient[] = [];

  function buildApp(overrides: NodeJS.ProcessEnv = {}): Express {
    const env = loadEnv({ ...process.env, ...overrides });
    const prisma = createPrismaClient(env);
    prismas.push(prisma);
    return createApp(createContainer(env, prisma), env);
  }

  afterAll(async () => {
    await Promise.all(prismas.map((p) => p.$disconnect()));
  });

  const configured = (): Express =>
    buildApp({
      APP_MIN_VERSION_IOS: '1.10.0',
      APP_MIN_VERSION_ANDROID: '2.0.0',
      FREE_PLAN_MAX_BANKS: '3',
      FREE_PLAN_CURRENT_MONTH_ONLY: 'false',
      APP_FLAGS: 'nuevoResumen,importarPdf',
    });

  it('401 without x-api-key', async () => {
    const res = await request(buildApp()).get('/api/config');

    expect(res.status).toBe(401);
  });

  it('401 with a wrong x-api-key', async () => {
    const res = await request(buildApp())
      .get('/api/config')
      .set('x-api-key', 'wrong-key-wrong-key-wrong');

    expect(res.status).toBe(401);
  });

  it('200 with x-api-key and no session; defaults force nobody', async () => {
    const res = await request(
      buildApp({
        APP_MIN_VERSION_IOS: undefined,
        APP_MIN_VERSION_ANDROID: undefined,
        FREE_PLAN_MAX_BANKS: undefined,
        FREE_PLAN_CURRENT_MONTH_ONLY: undefined,
        APP_FLAGS: undefined,
      }),
    )
      .get('/api/config')
      .set('x-api-key', API_KEY)
      .set('X-App-Platform', 'ios')
      .set('X-App-Version', '0.1.0');

    expect(res.status).toBe(200);
    expect(configResponseSchema.safeParse(res.body).success).toBe(true);
    expect(res.body).toEqual({
      versionMinima: { ios: '0.0.0', android: '0.0.0' },
      planGratis: { bancosMaximos: 2, soloMesActual: true },
      flags: {},
      actualizacionRequerida: false,
    });
  });

  it('values come from the API configuration (PLA-08)', async () => {
    const res = await request(configured())
      .get('/api/config')
      .set('x-api-key', API_KEY);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      versionMinima: { ios: '1.10.0', android: '2.0.0' },
      planGratis: { bancosMaximos: 3, soloMesActual: false },
      flags: { nuevoResumen: true, importarPdf: true },
      actualizacionRequerida: null,
    });
  });

  it.each([
    ['ios', '1.9.0'],
    ['iOS', '1.9.99'],
    ['android', '1.10.0'],
  ])(
    'minimum above the installed version → actualizacionRequerida=true (%s %s)',
    async (platform, version) => {
      const res = await request(configured())
        .get('/api/config')
        .set('x-api-key', API_KEY)
        .set('X-App-Platform', platform)
        .set('X-App-Version', version);

      expect(res.status).toBe(200);
      expect(res.body.actualizacionRequerida).toBe(true);
    },
  );

  it.each([
    ['ios', '1.10.0'],
    ['ios', '1.11.0'],
    ['android', '2.0.0'],
    ['android', '10.0.0'],
  ])(
    'installed equal or greater → actualizacionRequerida=false (%s %s)',
    async (platform, version) => {
      const res = await request(configured())
        .get('/api/config')
        .set('x-api-key', API_KEY)
        .set('X-App-Platform', platform)
        .set('X-App-Version', version);

      expect(res.status).toBe(200);
      expect(res.body.actualizacionRequerida).toBe(false);
    },
  );

  it.each([
    [{}],
    [{ 'X-App-Platform': 'ios' }],
    [{ 'X-App-Version': '1.0.0' }],
    [{ 'X-App-Platform': 'web', 'X-App-Version': '1.0.0' }],
    [{ 'X-App-Platform': 'ios', 'X-App-Version': '1.0' }],
    [{ 'X-App-Platform': 'ios', 'X-App-Version': '<script>' }],
  ])(
    'missing or invalid headers → 200 with actualizacionRequerida=null: %j',
    async (headers) => {
      const req = request(configured())
        .get('/api/config')
        .set('x-api-key', API_KEY);
      for (const [name, value] of Object.entries(headers)) req.set(name, value);
      const res = await req;

      expect(res.status).toBe(200);
      expect(res.body.actualizacionRequerida).toBeNull();
    },
  );
});
