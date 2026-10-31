/**
 * E2E tests for consents (#112, AUTH-03, PRI-02, PRI-06, ADR-006 §4).
 *
 * Builds the real container and app from env, with CONSENTS_REQUIRED on and off.
 *
 * Covered scenarios:
 *   - GET/POST/DELETE /api/consentimientos: session required, shape, validation
 *   - one user never reads or revokes another user's consent (RNF-SEC-006)
 *   - issue acceptance: no consent → 409 and the file is not read, on every
 *     route that imports; accepting opens them; revoking closes them again
 *   - flag off: imports behave exactly as before
 */
import { join } from 'node:path';
import request from 'supertest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createApp } from '../src/infrastructure/http-express/app';
import { createContainer } from '../src/composition/container';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';
import { loadEnv } from '../src/config/env';
import { copiarCatalogoTemplate } from '../src/infrastructure/persistence/catalogo-template';
import { crearSesionParaUsuario } from './support/session.fixture';
import {
  consentimientoResponseSchema,
  consentimientosResponseSchema,
} from '../src/infrastructure/http-express/schemas/consentimientos.schema';

const API_KEY = process.env.API_KEY ?? '';
const RUN_ID = `consentimientos-e2e-${Date.now()}`;
const XLSX = join(__dirname, 'fixtures', 'movimientos-test.xlsx');
const REQUERIDO = {
  code: 'CONSENTIMIENTO_CARTOLAS_REQUERIDO',
  message: 'Debes aceptar el procesamiento de cartolas antes de importar.',
};

describe('/api/consentimientos and the import gate (e2e, #112)', () => {
  const prismas: PrismaClient[] = [];
  let prisma: PrismaClient;
  let exigido: Express;
  let libre: Express;
  let authMarcela: string;
  let authOtro: string;
  const usuarios = [`${RUN_ID}-marcela`, `${RUN_ID}-otro`];

  function buildApp(CONSENTS_REQUIRED: string): Express {
    const env = loadEnv({ ...process.env, CONSENTS_REQUIRED });
    const client = createPrismaClient(env);
    prismas.push(client);
    return createApp(createContainer(env, client), env);
  }

  const post = (app: Express, path: string, auth: string) =>
    request(app)
      .post(path)
      .set('x-api-key', API_KEY)
      .set('Authorization', auth);

  const aceptar = (auth: string, tipo = 'cartolas', version = '2026-10') =>
    post(libre, '/api/consentimientos', auth).send({ tipo, version });

  const revocar = (auth: string, tipo = 'cartolas') =>
    request(libre)
      .delete(`/api/consentimientos/${tipo}`)
      .set('x-api-key', API_KEY)
      .set('Authorization', auth);

  const listar = (auth: string) =>
    request(libre)
      .get('/api/consentimientos')
      .set('x-api-key', API_KEY)
      .set('Authorization', auth);

  beforeAll(async () => {
    exigido = buildApp('true');
    libre = buildApp('false');
    prisma = prismas[0];
    for (const id of usuarios) {
      await prisma.user.create({ data: { id, nombre: id } });
      await copiarCatalogoTemplate(prisma, id);
    }
    authMarcela = `Bearer ${(await crearSesionParaUsuario(prisma, usuarios[0])).token}`;
    authOtro = `Bearer ${(await crearSesionParaUsuario(prisma, usuarios[1])).token}`;
  });

  beforeEach(async () => {
    await prisma.consentimiento.deleteMany({
      where: { userId: { in: usuarios } },
    });
  });

  afterAll(async () => {
    const cuenta = { where: { userId: { in: usuarios } } };
    await prisma.consentimiento.deleteMany(cuenta);
    await prisma.session.deleteMany(cuenta);
    await prisma.patronClasificacion.deleteMany(cuenta);
    await prisma.categoria.deleteMany(cuenta);
    await prisma.user.deleteMany({ where: { id: { in: usuarios } } });
    await Promise.all(prismas.map((p) => p.$disconnect()));
  });

  describe('GET/POST/DELETE /api/consentimientos', () => {
    it('401 without a session', async () => {
      const res = await request(libre)
        .get('/api/consentimientos')
        .set('x-api-key', API_KEY);

      expect(res.status).toBe(401);
    });

    it('GET starts empty', async () => {
      const res = await listar(authMarcela);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ consentimientos: [] });
    });

    it('POST returns 201 with the consent, and GET lists it', async () => {
      const res = await aceptar(authMarcela);

      expect(res.status).toBe(201);
      const body = consentimientoResponseSchema.parse(res.body);
      expect(body).toMatchObject({
        tipo: 'cartolas',
        version: '2026-10',
        revocadoEn: null,
      });
      expect(
        consentimientosResponseSchema.parse((await listar(authMarcela)).body),
      ).toEqual({ consentimientos: [body] });
    });

    it('POST persists exactly one row for the session user', async () => {
      await aceptar(authMarcela);

      const filas = await prisma.consentimiento.findMany({
        where: { userId: { in: usuarios } },
      });

      expect(filas).toHaveLength(1);
      expect(filas[0]).toMatchObject({
        userId: usuarios[0],
        tipo: 'cartolas',
        version: '2026-10',
        revocadoEn: null,
      });
    });

    it.each([
      [{ tipo: 'otro', version: '1' }, 'unknown type'],
      [{ tipo: 'cartolas' }, 'missing version'],
      [{ tipo: 'cartolas', version: 7 }, 'version is not text'],
      [{ tipo: 'cartolas', version: '1', userId: 'x' }, 'extra field'],
    ])('POST 400 BODY_INVALIDO: %j (%s)', async (body, _motivo) => {
      const res = await post(libre, '/api/consentimientos', authMarcela).send(
        body,
      );

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('BODY_INVALIDO');
      expect(
        await prisma.consentimiento.count({
          where: { userId: usuarios[0] },
        }),
      ).toBe(0);
    });

    it('POST 400 VERSION_CONSENTIMIENTO_INVALIDA for a malformed version', async () => {
      const res = await aceptar(authMarcela, 'cartolas', 'con espacio');

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        message: 'La versión del consentimiento no es válida.',
        code: 'VERSION_CONSENTIMIENTO_INVALIDA',
      });
    });

    it('DELETE returns 204, revokes and keeps the row as history', async () => {
      await aceptar(authMarcela);

      const res = await revocar(authMarcela);

      expect(res.status).toBe(204);
      expect(res.text).toBe('');
      const body = consentimientosResponseSchema.parse(
        (await listar(authMarcela)).body,
      );
      expect(body.consentimientos).toHaveLength(1);
      expect(body.consentimientos[0].revocadoEn).toEqual(expect.any(String));
    });

    it('DELETE without a consent in force is still 204', async () => {
      expect((await revocar(authMarcela)).status).toBe(204);
    });

    it('DELETE 400 TIPO_CONSENTIMIENTO_INVALIDO for an unknown type', async () => {
      const res = await revocar(authMarcela, 'otro');

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('TIPO_CONSENTIMIENTO_INVALIDO');
    });

    it('one user never reads or revokes the consent of another (RNF-SEC-006)', async () => {
      await aceptar(authMarcela);

      expect((await listar(authOtro)).body).toEqual({ consentimientos: [] });
      await revocar(authOtro);

      const body = consentimientosResponseSchema.parse(
        (await listar(authMarcela)).body,
      );
      expect(body.consentimientos[0].revocadoEn).toBeNull();
    });
  });

  describe('import gate', () => {
    const RUTAS = [
      '/api/ingestas',
      '/api/ingestas/preview',
      '/api/ingestas/commit',
    ];

    it.each(RUTAS)(
      'required, no consent: %s answers 409 and imports nothing',
      async (ruta) => {
        const res = await post(exigido, ruta, authMarcela).attach('file', XLSX);

        expect(res.status).toBe(409);
        expect(res.body).toEqual(REQUERIDO);
        expect(
          await prisma.ingesta.count({ where: { userId: usuarios[0] } }),
        ).toBe(0);
      },
    );

    it('the file is not read: a request with no file still gets the 409', async () => {
      const res = await post(exigido, '/api/ingestas/preview', authMarcela);

      expect(res.status).toBe(409);
      expect(res.body).toEqual(REQUERIDO);
    });

    it('a terms consent does not open the import', async () => {
      await aceptar(authMarcela, 'terminos');

      const res = await post(
        exigido,
        '/api/ingestas/preview',
        authMarcela,
      ).attach('file', XLSX);

      expect(res.status).toBe(409);
    });

    it('required, consent in force: the preview goes through', async () => {
      await aceptar(authMarcela);

      const res = await post(
        exigido,
        '/api/ingestas/preview',
        authMarcela,
      ).attach('file', XLSX);

      expect(res.status).toBe(200);
      expect(res.body.resumen.totalFilas).toBeGreaterThan(0);
    });

    it('another user consent does not open the import', async () => {
      await aceptar(authOtro);

      const res = await post(
        exigido,
        '/api/ingestas/preview',
        authMarcela,
      ).attach('file', XLSX);

      expect(res.status).toBe(409);
    });

    it('required, revoked consent: the import is blocked again (PRI-06)', async () => {
      await aceptar(authMarcela);
      await revocar(authMarcela);

      const res = await post(
        exigido,
        '/api/ingestas/preview',
        authMarcela,
      ).attach('file', XLSX);

      expect(res.status).toBe(409);
    });

    it('not required: the preview goes through without a consent', async () => {
      const res = await post(
        libre,
        '/api/ingestas/preview',
        authMarcela,
      ).attach('file', XLSX);

      expect(res.status).toBe(200);
    });
  });
});
