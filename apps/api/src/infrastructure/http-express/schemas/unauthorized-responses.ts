import type { ZodOpenApiResponseObject } from 'zod-openapi';

import {
  apiKeyUnauthorizedResponseSchema,
  credentialsUnauthorizedResponseSchema,
  unauthorizedResponseSchema,
} from './auth-error.schema';

/**
 * Reusable `401` responses for `buildOpenApiDocument()` — one per family of
 * causes (see `auth-error.schema.ts`). Every operation spreads exactly one of
 * them under `'401'` so the generated clients know which `code`s to expect.
 */
export const respuesta401Protegida: ZodOpenApiResponseObject = {
  description:
    'No valid API key (`code` API_KEY_INVALIDA) or no valid session — missing, unknown or expired ' +
    'token (`code` SESION_INVALIDA).',
  content: { 'application/json': { schema: unauthorizedResponseSchema } },
};

export const respuesta401SoloApiKey: ZodOpenApiResponseObject = {
  description: 'Missing or invalid `x-api-key` (`code` API_KEY_INVALIDA).',
  content: {
    'application/json': { schema: apiKeyUnauthorizedResponseSchema },
  },
};

export const respuesta401Credenciales: ZodOpenApiResponseObject = {
  description:
    'Missing or invalid `x-api-key` (`code` API_KEY_INVALIDA), or the credential check failed ' +
    '(`code` CREDENCIALES_INVALIDAS — one generic code for every cause, never echoes the credential).',
  content: {
    'application/json': { schema: credentialsUnauthorizedResponseSchema },
  },
};
