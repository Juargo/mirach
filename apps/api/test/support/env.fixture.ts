import { loadEnv, type Env } from '../../src/config/env';

/**
 * buildTestEnv — fixture de un `Env` válido para specs (ADR-029).
 *
 * Arranca de un `source` real (localhost/test/API_KEY válida) y lo pasa por
 * `loadEnv()` de verdad — no un mock — para que el fixture nunca diverja del
 * schema real. Los `overrides` se aplican DESPUÉS, sobre el resultado ya
 * parseado (`Partial<Env>`, valores tipados: boolean/number, no strings de
 * `source`), para que un spec que solo necesita cambiar `API_KEY` no tenga
 * que reconstruir un `source` completo.
 *
 * Los overrides NO vuelven a pasar por `superRefine` — es un fixture de test
 * (createContainer/createApp herméticos, sin DB), no un boot real. Si algún
 * spec necesita ejercitar las reglas de `superRefine` en sí, usa `loadEnv()`
 * directo (ver env.spec.ts), no este fixture.
 */
const BASE_SOURCE: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  PORT: '3000',
  DATABASE_URL: 'postgres://user:pass@localhost:5432/moneydiary-test',
  API_KEY: 'test-fixture-api-key-0000000000',
  COOKIE_SECURE: 'false',
  // 32 bytes fijos en base64 — clave de fixture, NUNCA usar en un ambiente real (ADR-013).
  ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
};

export function buildTestEnv(overrides: Partial<Env> = {}): Env {
  const base = loadEnv(BASE_SOURCE);
  return Object.freeze({ ...base, ...overrides });
}
