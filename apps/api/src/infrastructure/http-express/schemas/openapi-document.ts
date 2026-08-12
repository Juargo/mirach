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
import { authGoogleTokenRequestSchema } from './auth-google-token.schema';
import { authCapabilitiesResponseSchema } from './auth-capabilities.schema';
import {
  transaccionesCategoriaPathParamsSchema,
  transaccionesCategoriaRequestSchema,
  transaccionesCategoriaResponseSchema,
} from './transacciones-categoria.schema';
import {
  categoriaCreateRequestSchema,
  categoriaUpdateRequestSchema,
  categoriaIdPathParamsSchema,
  categoriaResponseSchema,
  catalogoResponseSchema,
} from './categorias.schema';
import {
  patronCreateRequestSchema,
  patronUpdateRequestSchema,
  patronIdPathParamsSchema,
  patronResponseSchema,
} from './patrones.schema';
import { catalogoErrorResponseSchema } from './catalogo-error.schema';

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
 * `GET /api/auth/capabilities` (AC-10, auth-google-login / auth-google-login-mobile
 * design §8/D7) — session-public, api-key required, ALWAYS mounted
 * regardless of either Google login gate's activation state. No query/path
 * params — the answer comes entirely from `container.googleAuth !==
 * undefined` (web) and `container.googleAuthMobile !== undefined` (mobile),
 * two independently computed flags.
 */
const authCapabilitiesOperation: ZodOpenApiOperationObject = {
  summary: 'Discover whether web and/or mobile Google login are active',
  description:
    'Public endpoint (requires x-api-key only, session-public — no prior session needed), always ' +
    'mounted regardless of whether GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET (web) or ' +
    'GOOGLE_CLIENT_ID_ANDROID (mobile) are configured (AC-10). Each client reads its own field ' +
    '(googleLoginEnabled or googleLoginMobileEnabled) before rendering its own Google-login affordance.',
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
 * `GET /api/auth/google` (AUTH-11, auth-google-login Slice C2) — initiates
 * the OIDC round trip. Same non-JSON, redirect-shaped contract as
 * `authDemoOperation`: no response body on any outcome, the transient state
 * travels via the `md_oauth` cookie (design §3), never in the response body.
 * `404` when the feature is inactive (AUTH-16 — same activation gate as
 * `authCapabilitiesOperation` reports).
 */
const authGoogleInitiateOperation: ZodOpenApiOperationObject = {
  summary: 'Start Google sign-in',
  description:
    'Public endpoint (requires x-api-key only, session-public) that starts the OIDC Authorization ' +
    'Code + PKCE round trip with Google (AUTH-11). Must be reached via a true top-level browser ' +
    'navigation — see AUTH-17. Sets the short-lived `md_oauth` cookie (state/nonce/PKCE) and ' +
    'redirects to Google. 404 when Google login is not active (AUTH-16) — see GET /api/auth/capabilities.',
  responses: {
    '302': {
      description: "Redirects to Google's OAuth 2.0 authorization endpoint.",
      headers: {
        Location: {
          description: "Google's authorization URL.",
          schema: { type: 'string' },
        },
      },
    },
    '403': {
      description:
        'Rejected: request is not a top-level navigation (anti-embed Fetch-Metadata guard, shared with GET /api/auth/demo).',
    },
    '404': {
      description:
        'Google login is not active — GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET are not both configured (AUTH-16).',
    },
    '429': {
      description:
        'Rate-limited: too many Google login attempts from this IP (budget shared with the callback, design §6.4).',
    },
  },
};

/**
 * `GET /api/auth/google/callback` (AUTH-12..15, Slice C2) — the OIDC
 * redirect target. `302` documents BOTH outcomes on purpose (design §10):
 * documenting that success and every failure cause share the exact same
 * response shape IS the AUTH-15 anti-enumeration contract, not an omission.
 */
const authGoogleCallbackOperation: ZodOpenApiOperationObject = {
  summary: 'Complete Google sign-in',
  description:
    "Public endpoint (requires x-api-key only, session-public) — Google's redirect target after " +
    'consent. Validates `state` against the `md_oauth` cookie and the `id_token` (signature/iss/aud/' +
    'exp/nonce) before any identity resolution (AUTH-12), then resolves the identity to an existing ' +
    'user (find-only, AUTH-14) and issues a session equivalent to password login (AUTH-13). Every ' +
    'failure cause — bad state, bad token, no matching user, an unexpected infra fault — produces the ' +
    'identical 302 redirect (AUTH-15): this contract intentionally does not distinguish them.',
  responses: {
    '302': {
      description:
        'Success: sets `md_session` and redirects to "/". Failure (any cause): redirects to ' +
        '"/login?error=google" with no session — see AUTH-15.',
      headers: {
        Location: {
          description: '"/" on success, "/login?error=google" on any failure.',
          schema: { type: 'string' },
        },
      },
    },
    '403': {
      description:
        'Rejected: request is not a top-level navigation (same Fetch-Metadata guard as initiate, design §3).',
    },
    '404': {
      description:
        'Google login is not active — GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET are not both configured (AUTH-16).',
    },
    '429': {
      description:
        'Rate-limited: too many Google login attempts from this IP (budget shared with initiate, design §6.4).',
    },
  },
};

/**
 * `POST /api/auth/google/token` (AUTH-19..24, ADR-035 M1, design §6) —
 * session-public, api-key required (AC-11). Mobile-only, native `id_token`
 * verification — reuses `authLoginResponseSchema` VERBATIM for the 200
 * response, so the document *proves* the body is identical to
 * `POST /api/auth/login` rather than asserting it in prose (design §6.2).
 * `404` when the mobile activation gate is off (`GOOGLE_CLIENT_ID_ANDROID`
 * absent, AUTH-22) — independent of the web Google login gate.
 */
const authGoogleTokenOperation: ZodOpenApiOperationObject = {
  summary: 'Authenticate with a native Google id_token (mobile)',
  description:
    'Public endpoint (requires x-api-key only, session-public — no prior session needed) that ' +
    'verifies a device-obtained Google id_token (AUTH-19) and, on success, issues a session ' +
    'identical in shape to POST /api/auth/login (AUTH-20). Every failure cause — invalid/expired/' +
    'wrong-audience token, unverified email, no matching account, a demo-user match, an email ' +
    'already linked to a different googleSub, or a JWKS/network failure — produces the identical ' +
    '401 body used by POST /api/auth/login (AUTH-21, anti-enumeration). No Set-Cookie: mobile uses ' +
    'Bearer + SecureStore. 404 when GOOGLE_CLIENT_ID_ANDROID is not configured (AUTH-22) — ' +
    "independent of GET /api/auth/google's activation gate.",
  requestBody: {
    content: {
      'application/json': { schema: authGoogleTokenRequestSchema },
    },
  },
  responses: {
    '200': {
      description:
        'Authentication succeeded — identical shape to POST /api/auth/login.',
      content: {
        'application/json': { schema: authLoginResponseSchema },
      },
    },
    '401': {
      description:
        'Verification or identity resolution failed (scrubbed — never echoes the id_token or email; ' +
        'identical body to POST /api/auth/login for every cause, AUTH-21).',
    },
    '404': {
      description:
        'Google login mobile is not active — GOOGLE_CLIENT_ID_ANDROID is not configured (AUTH-22).',
    },
    '429': {
      description:
        'Rate-limited: too many attempts from this IP (own budget, distinct from /auth/login and ' +
        'GET /api/auth/google, design §6.4).',
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
        "Invalid categoria — the given name does not resolve against the caller's own catalog " +
        '(scrubbed, CategoriaDesconocidaError; ADR-037 — the closed enum gate is retired).',
    },
    '404': {
      description:
        'Anti-enumeration: the transaction does not exist or does not belong to the authenticated user.',
    },
  },
};

/**
 * `GET`/`POST /api/categorias`, `PATCH`/`DELETE /api/categorias/{id}` (US-038,
 * CAT038-01…04/07) — the 4 catalog paths that carry the machine-readable
 * `code` (design.md Q2/§7.3, `CatalogoErrorResponse`). Boundary-validated
 * with `.safeParse()` (D-09) — unlike the pre-existing operations above,
 * which stay contract-only.
 */
const categoriasListOperation: ZodOpenApiOperationObject = {
  summary: "List the caller's category catalog",
  description:
    "Authenticated endpoint returning the caller's own categories with their nested classification " +
    'patterns and an all-history `transaccionesCount` per category — the caller-scoped impact ' +
    'preview for a destructive delete (US-038, CAT038-02; US-039, CAT039-01). Requires x-api-key + ' +
    'a valid session (RNF-SEC-006, per-user isolation). Available to demo sessions (read-only, ' +
    'CAT038-08).',
  responses: {
    '200': {
      description: "The caller's full catalog.",
      content: {
        'application/json': { schema: catalogoResponseSchema },
      },
    },
  },
};

const categoriasCreateOperation: ZodOpenApiOperationObject = {
  summary: 'Create a category',
  description:
    'Authenticated endpoint that creates a category owned by the caller (US-038, CAT038-01). ' +
    'Requires x-api-key + a valid session. Rejected for demo sessions (403 DEMO_SOLO_LECTURA).',
  requestBody: {
    content: {
      'application/json': { schema: categoriaCreateRequestSchema },
    },
  },
  responses: {
    '201': {
      description: 'Category created.',
      content: {
        'application/json': { schema: categoriaResponseSchema },
      },
    },
    '400': {
      description: 'Invalid nombre/bucket, or a malformed request body.',
      content: {
        'application/json': { schema: catalogoErrorResponseSchema },
      },
    },
    '403': {
      description: 'The calling session is a demo session (read-only catalog).',
      content: {
        'application/json': { schema: catalogoErrorResponseSchema },
      },
    },
    '409': {
      description:
        'A category with that nombre already exists for this user (case-insensitive).',
      content: {
        'application/json': { schema: catalogoErrorResponseSchema },
      },
    },
  },
};

const categoriasUpdateOperation: ZodOpenApiOperationObject = {
  summary: 'Rename and/or re-bucket a category',
  description:
    'Authenticated endpoint that partially updates a category (US-038, CAT038-03). At least one of ' +
    '`nombre`/`bucket` MUST be present. When `bucket` actually changes, every historical Transaccion ' +
    'pointing at the category is re-stamped atomically. Requires x-api-key + a valid session. ' +
    'Rejected for demo sessions.',
  requestParams: {
    path: categoriaIdPathParamsSchema,
  },
  requestBody: {
    content: {
      'application/json': { schema: categoriaUpdateRequestSchema },
    },
  },
  responses: {
    '200': {
      description: 'Category updated.',
      content: {
        'application/json': { schema: categoriaResponseSchema },
      },
    },
    '400': {
      description:
        'Invalid nombre/bucket, an empty body, or a malformed request body.',
      content: {
        'application/json': { schema: catalogoErrorResponseSchema },
      },
    },
    '403': {
      description: 'The calling session is a demo session (read-only catalog).',
      content: {
        'application/json': { schema: catalogoErrorResponseSchema },
      },
    },
    '404': {
      description:
        'Anti-enumeration: the category does not exist or does not belong to the authenticated user.',
      content: {
        'application/json': { schema: catalogoErrorResponseSchema },
      },
    },
    '409': {
      description:
        'A category with that nombre already exists for this user (case-insensitive).',
      content: {
        'application/json': { schema: catalogoErrorResponseSchema },
      },
    },
  },
};

const categoriasDeleteOperation: ZodOpenApiOperationObject = {
  summary: 'Delete a category',
  description:
    'Authenticated endpoint that deletes a category and cascades its patterns, atomically (US-038, ' +
    'CAT038-04). Rejected if any Transaccion (any period) still references the category. Requires ' +
    'x-api-key + a valid session. Rejected for demo sessions.',
  requestParams: {
    path: categoriaIdPathParamsSchema,
  },
  responses: {
    '204': {
      description: 'Category (and its patterns) deleted. No response body.',
    },
    '403': {
      description: 'The calling session is a demo session (read-only catalog).',
      content: {
        'application/json': { schema: catalogoErrorResponseSchema },
      },
    },
    '404': {
      description:
        'Anti-enumeration: the category does not exist or does not belong to the authenticated user.',
      content: {
        'application/json': { schema: catalogoErrorResponseSchema },
      },
    },
    '409': {
      description:
        'The category is referenced by at least one Transaccion (any period).',
      content: {
        'application/json': { schema: catalogoErrorResponseSchema },
      },
    },
  },
};

const patronesCreateOperation: ZodOpenApiOperationObject = {
  summary: 'Create a classification pattern',
  description:
    "Authenticated endpoint that creates a classification pattern under one of the caller's own " +
    'categories (US-038, CAT038-05/06). Requires x-api-key + a valid session. Rejected for demo ' +
    'sessions.',
  requestBody: {
    content: {
      'application/json': { schema: patronCreateRequestSchema },
    },
  },
  responses: {
    '201': {
      description: 'Pattern created.',
      content: {
        'application/json': { schema: patronResponseSchema },
      },
    },
    '400': {
      description:
        'Invalid patron/matchType/prioridad, an invalid REGEX (write-time compile check), or a ' +
        'malformed request body.',
      content: {
        'application/json': { schema: catalogoErrorResponseSchema },
      },
    },
    '403': {
      description: 'The calling session is a demo session (read-only catalog).',
      content: {
        'application/json': { schema: catalogoErrorResponseSchema },
      },
    },
    '404': {
      description:
        'Anti-enumeration: categoriaId does not exist or does not belong to the authenticated user.',
      content: {
        'application/json': { schema: catalogoErrorResponseSchema },
      },
    },
    '409': {
      description:
        'A pattern with that text already exists for this user (case-insensitive).',
      content: {
        'application/json': { schema: catalogoErrorResponseSchema },
      },
    },
  },
};

const patronesUpdateOperation: ZodOpenApiOperationObject = {
  summary: 'Update a classification pattern',
  description:
    'Authenticated endpoint that partially updates a pattern (US-038, CAT038-05). `categoriaId` is ' +
    'NOT accepted — moving a pattern between categories is a non-goal. Requires x-api-key + a valid ' +
    'session. Rejected for demo sessions.',
  requestParams: {
    path: patronIdPathParamsSchema,
  },
  requestBody: {
    content: {
      'application/json': { schema: patronUpdateRequestSchema },
    },
  },
  responses: {
    '200': {
      description: 'Pattern updated.',
      content: {
        'application/json': { schema: patronResponseSchema },
      },
    },
    '400': {
      description:
        'Invalid patron/matchType/prioridad, an invalid REGEX, an empty body, or a malformed request body.',
      content: {
        'application/json': { schema: catalogoErrorResponseSchema },
      },
    },
    '403': {
      description: 'The calling session is a demo session (read-only catalog).',
      content: {
        'application/json': { schema: catalogoErrorResponseSchema },
      },
    },
    '404': {
      description:
        'Anti-enumeration: the pattern does not exist or does not belong to the authenticated user.',
      content: {
        'application/json': { schema: catalogoErrorResponseSchema },
      },
    },
    '409': {
      description:
        'A pattern with that text already exists for this user (case-insensitive).',
      content: {
        'application/json': { schema: catalogoErrorResponseSchema },
      },
    },
  },
};

const patronesDeleteOperation: ZodOpenApiOperationObject = {
  summary: 'Delete a classification pattern',
  description:
    'Authenticated endpoint that deletes a pattern (US-038, CAT038-05/07). Requires x-api-key + a ' +
    'valid session. Rejected for demo sessions.',
  requestParams: {
    path: patronIdPathParamsSchema,
  },
  responses: {
    '204': {
      description: 'Pattern deleted. No response body.',
    },
    '403': {
      description: 'The calling session is a demo session (read-only catalog).',
      content: {
        'application/json': { schema: catalogoErrorResponseSchema },
      },
    },
    '404': {
      description:
        'Anti-enumeration: the pattern does not exist or does not belong to the authenticated user.',
      content: {
        'application/json': { schema: catalogoErrorResponseSchema },
      },
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
  '/api/auth/google': { get: authGoogleInitiateOperation },
  '/api/auth/google/callback': { get: authGoogleCallbackOperation },
  '/api/auth/google/token': { post: authGoogleTokenOperation },
  '/api/categorias': {
    get: categoriasListOperation,
    post: categoriasCreateOperation,
  },
  '/api/categorias/{id}': {
    patch: categoriasUpdateOperation,
    delete: categoriasDeleteOperation,
  },
  '/api/patrones': { post: patronesCreateOperation },
  '/api/patrones/{id}': {
    patch: patronesUpdateOperation,
    delete: patronesDeleteOperation,
  },
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
