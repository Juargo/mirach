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
 * here; `auth-error.schema.ts` builds every OpenAPI enum/literal from these
 * constants, so the spec follows.
 */
export const API_KEY_INVALIDA = 'API_KEY_INVALIDA';
export const SESION_INVALIDA = 'SESION_INVALIDA';
export const CREDENCIALES_INVALIDAS = 'CREDENCIALES_INVALIDAS';

export const CODIGOS_401 = [
  API_KEY_INVALIDA,
  SESION_INVALIDA,
  CREDENCIALES_INVALIDAS,
] as const;

export type Codigo401 = (typeof CODIGOS_401)[number];

/**
 * 503 of the token endpoints (#115): the identity could not be checked, which
 * says nothing about the credential, so it is not a 401. It does not depend on
 * who is signing in, so it reveals nothing about any account.
 */
export const SERVICIO_NO_DISPONIBLE = 'SERVICIO_NO_DISPONIBLE';

export const SERVICIO_NO_DISPONIBLE_BODY = {
  message: 'No pudimos verificar tu inicio de sesión. Intenta más tarde.',
  code: SERVICIO_NO_DISPONIBLE,
};
