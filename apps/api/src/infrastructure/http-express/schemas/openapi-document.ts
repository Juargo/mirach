import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  createDocument,
  type ZodOpenApiOperationObject,
  type ZodOpenApiPathsObject,
} from 'zod-openapi';

import { versionResponseSchema } from './version.schema';
import { resumenQuerySchema, resumenResponseSchema } from './resumen.schema';
import {
  resumenAnualQuerySchema,
  resumenAnualResponseSchema,
} from './resumen-anual.schema';
import {
  movimientosQuerySchema,
  movimientosResponseSchema,
} from './movimientos.schema';
import {
  bucketsPathParamsSchema,
  bucketsQuerySchema,
  bucketsResponseSchema,
} from './buckets.schema';
import { ingestasResponseSchema } from './ingestas.schema';
import {
  ingestaUploadRequestSchema,
  ingestaUploadResponseSchema,
} from './ingesta-upload.schema';
import {
  previewIngestaRequestSchema,
  previewIngestaResponseSchema,
} from './ingesta-preview.schema';
import { ingestaDeletePathParamsSchema } from './ingesta-delete.schema';
import { authMeResponseSchema } from './auth-me.schema';
import {
  authLoginRequestSchema,
  authLoginResponseSchema,
} from './auth-login.schema';
import { authCapabilitiesResponseSchema } from './auth-capabilities.schema';
import {
  transaccionesCategoriaPathParamsSchema,
  transaccionesCategoriaRequestSchema,
  transaccionesCategoriaResponseSchema,
} from './transacciones-categoria.schema';

/**
 * `buildOpenApiDocument()` is the single source of the OpenAPI 3.1.0 contract
 * (openapi-contract-express design, ADR-011 amend). It is PURE — no
 * container, no env, no DB — so it can run at build time
 * (`scripts/emit-openapi.ts`, against the `api` CI job that has no
 * database) and in unit tests alike.
 *
 * `version` is read from package.json the same way `build-info.ts` reads it
 * (fs, not `import`, to stay inside `rootDir: src` — TS6059) — this is
 * static repo metadata, not runtime/env state, so it does not break purity.
 */
const pkg = JSON.parse(
  readFileSync(join(__dirname, '../../../../package.json'), 'utf8'),
) as { version: string };

const versionOperation: ZodOpenApiOperationObject = {
  summary: 'Deployed build info',
  description:
    'Public, unauthenticated endpoint exposing the currently deployed build (ADR-030).',
  responses: {
    '200': {
      description: 'Build info for the currently deployed API instance.',
      content: {
        'application/json': { schema: versionResponseSchema },
      },
    },
  },
};

const resumenOperation: ZodOpenApiOperationObject = {
  summary: 'Monthly 50/30/20 breakdown',
  description:
    'Authenticated endpoint returning the 50/30/20 budget breakdown for a month (US-015/016). ' +
    'Requires x-api-key + a valid session (RNF-SEC-006, per-user isolation).',
  requestParams: {
    query: resumenQuerySchema,
  },
  responses: {
    '200': {
      description: 'Monthly resumen for the resolved period.',
      content: {
        'application/json': { schema: resumenResponseSchema },
      },
    },
    '400': {
      description:
        'Invalid periodo — either a transport-shape mismatch or a malformed YYYY-MM value (domain-level, PeriodoMes VO).',
    },
  },
};

const resumenAnualOperation: ZodOpenApiOperationObject = {
  summary: 'Annual 50/30/20 breakdown',
  description:
    'Authenticated endpoint returning the 50/30/20 budget breakdown for all 12 months of a year (US-030). ' +
    'Requires x-api-key + a valid session (RNF-SEC-006, per-user isolation).',
  requestParams: {
    query: resumenAnualQuerySchema,
  },
  responses: {
    '200': {
      description: 'Annual resumen for the resolved year.',
      content: {
        'application/json': { schema: resumenAnualResponseSchema },
      },
    },
    '400': {
      description:
        'Invalid anio — either a transport-shape mismatch or a malformed/out-of-range value (domain-level).',
    },
  },
};

const movimientosOperation: ZodOpenApiOperationObject = {
  summary: 'Monthly transaction list',
  description:
    'Authenticated endpoint returning the consolidated monthly transaction list (US-014). ' +
    'Requires x-api-key + a valid session (RNF-SEC-006, per-user isolation).',
  requestParams: {
    query: movimientosQuerySchema,
  },
  responses: {
    '200': {
      description: 'Monthly transaction list for the resolved period.',
      content: {
        'application/json': { schema: movimientosResponseSchema },
      },
    },
    '400': {
      description:
        'Invalid periodo — either a transport-shape mismatch or a malformed YYYY-MM value (domain-level, PeriodoMes VO).',
    },
  },
};

const bucketsOperation: ZodOpenApiOperationObject = {
  summary: 'Bucket drill-down',
  description:
    'Authenticated endpoint returning the transaction detail for a single spend bucket (US-017). ' +
    'Requires x-api-key + a valid session (RNF-SEC-006, per-user isolation).',
  requestParams: {
    path: bucketsPathParamsSchema,
    query: bucketsQuerySchema,
  },
  responses: {
    '200': {
      description: 'Bucket detail for the resolved period.',
      content: {
        'application/json': { schema: bucketsResponseSchema },
      },
    },
    '400': {
      description:
        'Invalid bucket (unrecognized value) or invalid periodo — both domain-level (BucketInvalidoError / PeriodoInvalidoError).',
    },
  },
};

const ingestasOperation: ZodOpenApiOperationObject = {
  summary: 'List ingestas',
  description:
    'Authenticated endpoint returning the per-user ingesta history (US-004/US-018). ' +
    'Requires x-api-key + a valid session (RNF-SEC-006, per-user isolation).',
  responses: {
    '200': {
      description: 'Ingesta list for the authenticated user.',
      content: {
        'application/json': { schema: ingestasResponseSchema },
      },
    },
  },
};

const ingestaUploadOperation: ZodOpenApiOperationObject = {
  summary: 'Upload a bank statement',
  description:
    'Authenticated endpoint that detects the bank, validates structure, normalizes, persists, and ' +
    'categorizes a bank statement file (US-004/US-005/US-011). Requires x-api-key + a valid session ' +
    '(RNF-SEC-006, per-user isolation).',
  requestBody: {
    content: {
      'multipart/form-data': { schema: ingestaUploadRequestSchema },
    },
  },
  responses: {
    '200': {
      description: 'Upload processed and persisted.',
      content: {
        'application/json': { schema: ingestaUploadResponseSchema },
      },
    },
    '400': {
      description:
        'Invalid file — missing file field, disallowed extension, unrecognized bank, invalid ' +
        'structure/normalization, or an oversized file (>10 MB).',
    },
    '500': {
      description:
        'Persistence failure (infrastructure fault, not the uploaded file).',
    },
  },
};

const ingestaPreviewOperation: ZodOpenApiOperationObject = {
  summary: 'Preview a bank statement (dry run)',
  description:
    'Authenticated endpoint that detects the bank, validates structure, and normalizes a sample of a ' +
    'would-be upload WITHOUT persisting anything (US-003). Requires x-api-key + a valid session; the ' +
    'result itself is not scoped by user (no tenant data is touched).',
  requestBody: {
    content: {
      'multipart/form-data': { schema: previewIngestaRequestSchema },
    },
  },
  responses: {
    '200': {
      description: 'Preview sample computed (not persisted).',
      content: {
        'application/json': { schema: previewIngestaResponseSchema },
      },
    },
    '400': {
      description:
        'Invalid file — missing file field, disallowed extension, unrecognized bank, invalid ' +
        'structure/normalization, or an oversized file (>10 MB).',
    },
  },
};

const ingestaDeleteOperation: ZodOpenApiOperationObject = {
  summary: 'Delete an ingesta',
  description:
    'Authenticated endpoint that cascade-deletes an ingesta and its transactions (US-018, ING-01/ING-02). ' +
    'Requires x-api-key + a valid session (RNF-SEC-006, per-user isolation).',
  requestParams: {
    path: ingestaDeletePathParamsSchema,
  },
  responses: {
    '204': {
      description: 'Ingesta deleted. No response body.',
    },
    '404': {
      description:
        'Anti-enumeration: the ingesta does not exist or does not belong to the authenticated user.',
    },
  },
};

const authMeOperation: ZodOpenApiOperationObject = {
  summary: 'Current session identity',
  description:
    'Authenticated endpoint returning the identity of the current session (AUTH-09, DEMO-AUTH-05). ' +
    'Requires x-api-key + a valid session.',
  responses: {
    '200': {
      description: 'Identity of the authenticated session.',
      content: {
        'application/json': { schema: authMeResponseSchema },
      },
    },
    '401': {
      description: 'No valid session (missing, expired, or invalid token).',
    },
  },
};

/**
 * `GET /api/auth/demo` (DEMO-AUTH-05) is NOT a JSON endpoint — on success it
 * sets the `md_session` cookie and 302-redirects to `/`; there is no 200
 * response and therefore no response-body schema to register or sync-test
 * (see `registrarAuthPublic`, `routes/auth.routes.ts`). It also guards
 * against embedding (403, Fetch-Metadata) and rate limiting (429).
 */
const authDemoOperation: ZodOpenApiOperationObject = {
  summary: 'Create or resume a demo session',
  description:
    'Public endpoint (requires x-api-key only) that creates a demo account or resumes an existing ' +
    'valid session, then redirects. No JSON response body — the session is conveyed via the ' +
    '`md_session` cookie (Set-Cookie) and the redirect target.',
  responses: {
    '302': {
      description:
        'Session established (new demo or resumed existing); redirects to the app root.',
      headers: {
        Location: {
          description: 'Always "/" — the app root.',
          schema: { type: 'string' },
        },
      },
    },
    '403': {
      description:
        'Rejected: request is not a top-level navigation (anti-embed Fetch-Metadata guard).',
    },
    '429': {
      description: 'Rate-limited: too many demo requests from this IP.',
    },
  },
};

/**
 * `POST /api/auth/login` (AUTH-01) — CONTRACT-ONLY (openapi-contract-express
 * Phase 10.2b, writes/sensitive group): documents the request/response
 * shapes, but `registrarAuthPublic` (`routes/auth.routes.ts`) is left
 * UNCHANGED — no `.safeParse()` boundary validation is wired in, to preserve
 * the exact existing auth behavior on this sensitive endpoint.
 */
const authLoginOperation: ZodOpenApiOperationObject = {
  summary: 'Authenticate with email and password',
  description:
    'Public endpoint (requires x-api-key only, session-public — no prior session needed) that ' +
    'authenticates a user and returns a session token (AUTH-01). Sets the `md_session` cookie ' +
    '(Set-Cookie) in addition to the JSON body.',
  requestBody: {
    content: {
      'application/json': { schema: authLoginRequestSchema },
    },
  },
  responses: {
    '200': {
      description: 'Authentication succeeded.',
      content: {
        'application/json': { schema: authLoginResponseSchema },
      },
    },
    '401': {
      description:
        'Invalid credentials (scrubbed — never echoes email/password).',
    },
    '429': {
      description:
        'Rate-limited: too many failed login attempts from this IP/email combination.',
    },
  },
};

/**
 * `POST /api/auth/logout` (AUTH-01) — CONTRACT-ONLY, same as login. No
 * request body, no response body (`registrarAuthPublic` always responds
 * `204 No Content`, even for an already-invalid/missing token — logout is
 * deliberately robust and never fails the caller).
 */
const authLogoutOperation: ZodOpenApiOperationObject = {
  summary: 'End the current session',
  description:
    'Public endpoint (requires x-api-key only, session-public) that invalidates the current ' +
    'session token (if any) and clears the `md_session` cookie. Always succeeds — an already ' +
    'missing or invalid token does not produce an error.',
  responses: {
    '204': {
      description: 'Session ended (or was already absent). No response body.',
    },
  },
};

/**
 * `GET /api/auth/capabilities` (AC-10, auth-google-login Slice C1) —
 * session-public, api-key required, ALWAYS mounted regardless of Google
 * login's activation state (design §4.5). No query/path params — the
 * answer comes entirely from `container.googleAuth !== undefined`.
 */
const authCapabilitiesOperation: ZodOpenApiOperationObject = {
  summary: 'Discover whether Google login is active',
  description:
    'Public endpoint (requires x-api-key only, session-public — no prior session needed), always ' +
    'mounted regardless of whether GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET are configured (AC-10). ' +
    'Clients read this before rendering any Google-login affordance.',
  responses: {
    '200': {
      description: 'Current activation state of Google login.',
      content: {
        'application/json': { schema: authCapabilitiesResponseSchema },
      },
    },
    '401': {
      description: 'Missing or invalid x-api-key.',
    },
  },
};

/**
 * `PATCH /api/transacciones/:id/categoria` (US-013 S4) — CONTRACT-ONLY
 * (openapi-contract-express Phase 10.2b, writes/sensitive group): documents
 * the request/response shapes, but `registrarTransacciones`
 * (`routes/transacciones.routes.ts`) is left UNCHANGED — no `.safeParse()`
 * boundary validation is wired in, to preserve the exact existing
 * reclassification behavior on this sensitive endpoint.
 */
const transaccionesCategoriaOperation: ZodOpenApiOperationObject = {
  summary: 'Reclassify a transaction',
  description:
    'Authenticated endpoint that manually reassigns a transaction to a category (and its derived ' +
    'bucket) (US-013 S4). Requires x-api-key + a valid session (RNF-SEC-006, per-user isolation).',
  requestParams: {
    path: transaccionesCategoriaPathParamsSchema,
  },
  requestBody: {
    content: {
      'application/json': { schema: transaccionesCategoriaRequestSchema },
    },
  },
  responses: {
    '200': {
      description: 'Transaction reclassified.',
      content: {
        'application/json': { schema: transaccionesCategoriaResponseSchema },
      },
    },
    '400': {
      description:
        'Invalid categoria — not a recognized value in the domain enum (scrubbed, CategoriaInvalidaError).',
    },
    '404': {
      description:
        'Anti-enumeration: the transaction does not exist or does not belong to the authenticated user.',
    },
  },
};

/**
 * Explicit, FIXED-ORDER registration — one entry per endpoint. This order is
 * part of the determinism contract (openapi-contract-express design):
 * appending future endpoints (Slice 1+) must append here, never reorder
 * entries already registered, so `openapi:check` only ever diffs genuine
 * contract changes.
 */
const paths: ZodOpenApiPathsObject = {
  '/version': { get: versionOperation },
  '/api/resumen': { get: resumenOperation },
  '/api/resumen/anual': { get: resumenAnualOperation },
  '/api/movimientos': { get: movimientosOperation },
  '/api/buckets/{bucket}': { get: bucketsOperation },
  '/api/ingestas': { get: ingestasOperation, post: ingestaUploadOperation },
  '/api/auth/me': { get: authMeOperation },
  '/api/auth/demo': { get: authDemoOperation },
  '/api/ingestas/preview': { post: ingestaPreviewOperation },
  '/api/ingestas/{id}': { delete: ingestaDeleteOperation },
  '/api/auth/login': { post: authLoginOperation },
  '/api/auth/logout': { post: authLogoutOperation },
  '/api/transacciones/{id}/categoria': {
    patch: transaccionesCategoriaOperation,
  },
  '/api/auth/capabilities': { get: authCapabilitiesOperation },
};

export function buildOpenApiDocument() {
  return createDocument({
    openapi: '3.1.0',
    info: {
      title: 'MoneyDiary API',
      version: pkg.version,
      description:
        'HTTP contract for the MoneyDiary Express API, sourced from Zod schemas (ADR-011 amend).',
    },
    paths,
  });
}
