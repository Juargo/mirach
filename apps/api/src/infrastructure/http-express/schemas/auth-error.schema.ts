import { z } from 'zod';
import {
  API_KEY_INVALIDA,
  CREDENCIALES_INVALIDAS,
  SESION_INVALIDA,
} from '../auth-error-codes';

/**
 * Bodies of the three 401 families the API answers (`auth-error-codes.ts` is the
 * single source of the codes). They are separate schemas because the set of
 * possible causes differs per endpoint family, and a generated client should
 * only have to handle the causes that can really happen:
 *
 * - `UnauthorizedResponse` — every authenticated endpoint: the API-key gate
 *   runs first (`API_KEY_INVALIDA`), then the session gate (`SESION_INVALIDA`).
 * - `ApiKeyUnauthorizedResponse` — session-public endpoints that only need the
 *   API key (logout, capabilities, the Google web flow).
 * - `CredentialsUnauthorizedResponse` — `/auth/login`, `/auth/google/token`,
 *   `/auth/apple/token`: the API-key gate, or ONE generic credential failure.
 */
const message = z.string();

export const unauthorizedResponseSchema = z
  .object({
    message,
    code: z
      .enum([API_KEY_INVALIDA, SESION_INVALIDA])
      .describe(
        'API_KEY_INVALIDA: the `x-api-key` header is missing or wrong (an app configuration problem; ' +
          'signing in again does not help). SESION_INVALIDA: the session token is missing, unknown or ' +
          'expired (send the user back to sign-in).',
      ),
  })
  .meta({
    id: 'UnauthorizedResponse',
    description:
      '401 body of every authenticated endpoint. Branch on `code`, never on `message`.',
  });

export const apiKeyUnauthorizedResponseSchema = z
  .object({
    message,
    code: z
      .literal(API_KEY_INVALIDA)
      .describe('The `x-api-key` header is missing or wrong.'),
  })
  .meta({
    id: 'ApiKeyUnauthorizedResponse',
    description:
      '401 body of an endpoint that needs only the API key (no session).',
  });

export const credentialsUnauthorizedResponseSchema = z
  .object({
    message,
    code: z
      .enum([API_KEY_INVALIDA, CREDENCIALES_INVALIDAS])
      .describe(
        'API_KEY_INVALIDA: the `x-api-key` header is missing or wrong. CREDENCIALES_INVALIDAS: the ' +
          'credential check failed — the SAME code for every cause (wrong password, unknown email, ' +
          'invalid or expired id_token, ...), so it never reveals which credential failed.',
      ),
  })
  .meta({
    id: 'CredentialsUnauthorizedResponse',
    description: '401 body of the sign-in endpoints.',
  });
