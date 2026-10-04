/**
 * Stable, machine-readable `code` for every 401 the API answers. Clients branch
 * on `code`, never on `message` (the Spanish copy may change).
 *
 * - `API_KEY_INVALIDA`: the `x-api-key` header is missing or wrong. Fix the
 *   app's configuration; signing in again does not help.
 * - `SESION_INVALIDA`: the session token is missing, unknown or expired. The
 *   client must send the user back to sign-in.
 * - `CREDENCIALES_INVALIDAS`: a credential check failed on `/auth/login`,
 *   `/auth/google/token` or `/auth/apple/token`. One code for every cause
 *   (wrong password, unknown email, bad id_token, ...) so the response never
 *   reveals which credential failed (anti-enumeration, AUTH-02/AUTH-21).
 *
 * One class ⇒ one code. The set is closed: a new 401 cause needs a new entry
 * here and in `auth-error.schema.ts` (the OpenAPI enum reads this tuple).
 */
export const CODIGOS_401 = [
  'API_KEY_INVALIDA',
  'SESION_INVALIDA',
  'CREDENCIALES_INVALIDAS',
] as const;

export type Codigo401 = (typeof CODIGOS_401)[number];

export const API_KEY_INVALIDA: Codigo401 = 'API_KEY_INVALIDA';
export const SESION_INVALIDA: Codigo401 = 'SESION_INVALIDA';
export const CREDENCIALES_INVALIDAS: Codigo401 = 'CREDENCIALES_INVALIDAS';
