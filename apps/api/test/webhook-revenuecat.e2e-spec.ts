/**
 * E2E tests for `POST /api/webhooks/revenuecat` (ADR-012 §1, ADR-015 §5).
 *
 * Builds the real container and app from env, with and without the webhook
 * secret.
 *
 * Covered scenarios:
 *   - off (404) without REVENUECAT_WEBHOOK_SECRET
 *   - the secret in `Authorization` is the only credential: no x-api-key, no
 *     session; a missing or wrong secret is 401 and writes nothing
 *   - a purchase turns the user's plan into Plus, and its expiry back to free
 *   - a redelivered event changes nothing
 *   - the Fundador purchase and its refund
 *   - events the API does not act on still answer 200
 *   - a malformed body is 400
 */
import request from 'supertest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createApp } from '../src/infrastructure/http-express/app';
import { createContainer } from '../src/composition/container';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';
import { loadEnv } from '../src/config/env';
import { crearSesionParaUsuario } from './support/session.fixture';

const API_KEY = process.env.API_KEY ?? '';
const RUN_ID = `webhook-e2e-${Date.now()}`;
const SECRETO = 'webhook-test-secret-not-a-secret-0123456789';
const FUNDADOR = 'plus_fundador';
const DIA = 24 * 60 * 60 * 1000;

describe('POST /api/webhooks/revenuecat (e2e)', () => {
  const prismas: PrismaClient[] = [];
  let prisma: PrismaClient;
  let app: Express;
  let apagado: Express;
  let auth: string;
  const user = `${RUN_ID}-marcela`;
  const cuenta = { where: { userId: user } };
  let secuencia = 0;

  function buildApp(extra: Record<string, string | undefined>): Express {
    const env = loadEnv({ ...process.env, ...extra });
    const client = createPrismaClient(env);
    prismas.push(client);
    return createApp(createContainer(env, client), env);
  }

  const evento = (cambios: Record<string, unknown> = {}) => {
    const ahora = Date.now();
    return {
      api_version: '1.0',
      event: {
        id: `${RUN_ID}-evt-${++secuencia}`,
        type: 'INITIAL_PURCHASE',
        event_timestamp_ms: ahora + secuencia,
        app_user_id: user,
        original_app_user_id: user,
        aliases: [user],
        product_id: 'plus_mensual',
        period_type: 'NORMAL',
        purchased_at_ms: ahora,
        expiration_at_ms: ahora + 30 * DIA,
        store: 'PLAY_STORE',
        environment: 'PRODUCTION',
        ...cambios,
      },
    };
  };

  const enviar = (cuerpo: unknown, autorizacion: string | null = SECRETO) => {
    const req = request(app).post('/api/webhooks/revenuecat');
    if (autorizacion !== null) {
      void req.set('Authorization', autorizacion);
    }
    return req.send(cuerpo as object);
  };

  const plan = async () =>
    (
      await request(app)
        .get('/api/plan')
        .set('x-api-key', API_KEY)
        .set('Authorization', auth)
    ).body as { plan: string; origen: string | null; renueva: boolean };

  const limpiar = async () => {
    await prisma.suscripcion.deleteMany(cuenta);
    await prisma.permisoPlan.deleteMany(cuenta);
    await prisma.eventoSuscripcionProcesado.deleteMany({
      where: { id: { startsWith: RUN_ID } },
    });
  };

  beforeAll(async () => {
    app = buildApp({
      REVENUECAT_WEBHOOK_SECRET: SECRETO,
      REVENUECAT_FUNDADOR_PRODUCT_ID: FUNDADOR,
    });
    apagado = buildApp({
      REVENUECAT_WEBHOOK_SECRET: undefined,
      REVENUECAT_FUNDADOR_PRODUCT_ID: undefined,
    });
    prisma = prismas[0];
    await prisma.user.create({ data: { id: user, nombre: user } });
    auth = `Bearer ${(await crearSesionParaUsuario(prisma, user)).token}`;
  });

  beforeEach(limpiar);

  afterAll(async () => {
    await limpiar();
    await prisma.session.deleteMany(cuenta);
    await prisma.user.deleteMany({ where: { id: user } });
    await Promise.all(prismas.map((p) => p.$disconnect()));
  });

  describe('activation and authentication', () => {
    it('404 when the secret is not configured, even with a valid-looking request', async () => {
      const res = await request(apagado)
        .post('/api/webhooks/revenuecat')
        .set('Authorization', SECRETO)
        .set('x-api-key', API_KEY)
        .send(evento());

      expect(res.status).toBe(404);
      expect(await prisma.suscripcion.count(cuenta)).toBe(0);
    });

    it.each([
      ['no Authorization header', null],
      ['a wrong secret', `${SECRETO}x`],
      ['a prefix of the secret', SECRETO.slice(0, -1)],
      ['an empty Bearer', 'Bearer '],
      ['the public API key', API_KEY],
    ])('401 with %s, and nothing is written', async (_caso, autorizacion) => {
      const res = await enviar(evento(), autorizacion);

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ message: 'No autorizado.' });
      expect(await prisma.suscripcion.count(cuenta)).toBe(0);
    });

    it('the x-api-key alone does not authenticate the webhook', async () => {
      const res = await request(app)
        .post('/api/webhooks/revenuecat')
        .set('x-api-key', API_KEY)
        .send(evento());

      expect(res.status).toBe(401);
    });

    it.each([
      ['the secret', SECRETO],
      ['the secret as a Bearer token', `Bearer ${SECRETO}`],
    ])('200 with %s and no x-api-key', async (_caso, autorizacion) => {
      const res = await enviar(evento(), autorizacion);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ resultado: 'aplicado' });
    });
  });

  describe('events', () => {
    it('a purchase makes the plan Plus, and its expiration makes it free again', async () => {
      expect((await plan()).plan).toBe('gratis');

      await enviar(evento());

      expect(await plan()).toMatchObject({
        plan: 'plus',
        origen: 'suscripcion',
        renueva: true,
      });

      const res = await enviar(
        evento({ type: 'EXPIRATION', expiration_at_ms: Date.now() - DIA }),
      );

      expect(res.body).toEqual({ resultado: 'aplicado' });
      expect((await plan()).plan).toBe('gratis');
      expect(await prisma.suscripcion.count(cuenta)).toBe(1);
    });

    it('a cancellation keeps Plus until the end of the paid period, without renewal', async () => {
      await enviar(evento());

      await enviar(
        evento({ type: 'CANCELLATION', cancel_reason: 'UNSUBSCRIBE' }),
      );

      expect(await plan()).toMatchObject({ plan: 'plus', renueva: false });
    });

    it('a redelivered event answers 200 and changes nothing', async () => {
      const compra = evento();
      await enviar(compra);
      await enviar(
        evento({ type: 'EXPIRATION', expiration_at_ms: Date.now() - DIA }),
      );

      const res = await enviar(compra);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ resultado: 'duplicado' });
      expect((await plan()).plan).toBe('gratis');
    });

    it('the Fundador purchase gives Plus for life, and its refund takes it away', async () => {
      const compra = await enviar(
        evento({
          type: 'NON_RENEWING_PURCHASE',
          product_id: FUNDADOR,
          expiration_at_ms: null,
        }),
      );

      expect(compra.body).toEqual({ resultado: 'aplicado' });
      expect(await plan()).toMatchObject({ plan: 'plus', origen: 'fundador' });

      await enviar(
        evento({
          type: 'CANCELLATION',
          product_id: FUNDADOR,
          cancel_reason: 'CUSTOMER_SUPPORT',
          expiration_at_ms: null,
        }),
      );

      expect((await plan()).plan).toBe('gratis');
      expect(await prisma.permisoPlan.count(cuenta)).toBe(1);
    });

    it('200 for an event of a user that does not exist', async () => {
      const res = await enviar(
        evento({
          app_user_id: `${RUN_ID}-nadie`,
          original_app_user_id: `${RUN_ID}-nadie`,
          aliases: [],
        }),
      );

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ resultado: 'usuario_desconocido' });
    });

    it.each(['TEST', 'SUBSCRIPTION_PAUSED', 'A_TYPE_ADDED_LATER'])(
      '200 and no change for %s',
      async (type) => {
        const res = await enviar(evento({ type }));

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ resultado: 'ignorado' });
        expect(await prisma.suscripcion.count(cuenta)).toBe(0);
      },
    );

    it.each([
      ['an empty object', {}],
      ['an event without id', evento({ id: undefined })],
      ['an array', [evento()]],
    ])('400 for %s', async (_caso, cuerpo) => {
      const res = await enviar(cuerpo);

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        message: 'El evento de RevenueCat no tiene el formato esperado.',
      });
    });
  });
});
