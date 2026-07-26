import request from 'supertest';
import type { Express } from 'express';

/** Sesión autenticada resultante de un login e2e exitoso. */
export interface Sesion {
  readonly cookie: string;
  readonly token: string;
  readonly userId: string;
}

/**
 * loginAsSeededUser — inicia sesión como el usuario fijo del seed
 * (USER_ID_FIJO) vía `SEED_USER_EMAIL`/`SEED_USER_PASSWORD` (ver
 * `apps/api/docs/local-test-db.md` y `prisma/seed.ts`).
 *
 * Los specs e2e que golpean rutas protegidas por `sessionMiddleware`
 * (resumen, buckets, movimientos, transacciones, ingestas) necesitan una
 * cookie de sesión real además del `x-api-key` — este helper la obtiene.
 *
 * Falla ruidosamente (throw) si las credenciales no están en el entorno, en
 * vez de degradar en silencio: sin esto, una BD mal configurada haría que
 * las aserciones protegidas por sesión (incluida el aislamiento por
 * usuario) se conviertan en no-ops sin que ningún test lo note.
 */
export async function loginAsSeededUser(app: Express): Promise<Sesion> {
  const email = process.env.SEED_USER_EMAIL;
  const password = process.env.SEED_USER_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'SEED_USER_EMAIL/SEED_USER_PASSWORD deben estar seteadas (ver apps/api/docs/local-test-db.md) ' +
        'para correr specs e2e protegidos por sesión.',
    );
  }

  const res = await request(app)
    .post('/api/auth/login')
    .set('x-api-key', process.env.API_KEY ?? '')
    .send({ email, password })
    .expect(200);

  const setCookie = res.headers['set-cookie'] as unknown as string[];
  const cookie = setCookie[0]!.split(';')[0]!; // "md_session=<token>"

  return {
    cookie,
    token: res.body.token as string,
    userId: res.body.userId as string,
  };
}
