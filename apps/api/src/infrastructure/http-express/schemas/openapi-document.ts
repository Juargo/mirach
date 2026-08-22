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
  semaforoDetalleQuerySchema,
  semaforoDetalleResponseSchema,
} from './semaforo-detalle.schema';
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
import {
  bucketDetalleMesQuerySchema,
  bucketDetalleMesResponseSchema,
} from './bucket-detalle-mes.schema';
import {
  ingresosMesQuerySchema,
  ingresosMesResponseSchema,
} from './ingresos-mes.schema';
import { ingestasResponseSchema } from './ingestas.schema';
import {
  ingestaUploadRequestSchema,
  ingestaUploadResponseSchema,
} from './ingesta-upload.schema';
import {
  previewIngestaRequestSchema,
  previewIngestaResponseSchema,
} from './ingesta-preview.schema';
import {
  commitIngestaRequestSchema,
  commitIngestaResponseSchema,
} from './ingesta-commit.schema';
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
import {
  perfilUpdateRequestSchema,
  perfilErrorResponseSchema,
  passwordUpdateRequestSchema,
} from './perfil.schema';
import {
  vincularGoogleRequestSchema,
  vincularGoogleResponseSchema,
  desvincularGoogleRequestSchema,
} from './perfil-google.schema';

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
  deprecated: true,
  summary:
    'Upload a bank statement (deprecated — use POST /api/ingestas/commit)',
  description:
    'Authenticated endpoint that detects the bank, validates structure, normalizes, persists, and ' +
    'categorizes a bank statement file (US-004/US-005/US-011). Requires x-api-key + a valid session ' +
    '(RNF-SEC-006, per-user isolation). ' +
    'DEPRECATED at US-057 (D-14/CA-05): this one-shot endpoint is superseded by the two-step ' +
    'POST /api/ingestas/preview → POST /api/ingestas/commit flow. Physical removal is tracked by ' +
    'US-061. Behavior is UNCHANGED — existing callers (mobile, ADR-026) continue to work.',
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
  summary: 'Preview a bank statement (dry run, US-057)',
  description:
    'Authenticated endpoint that detects the bank, validates structure, deduplicates and auto-classifies ' +
    'a bank statement WITHOUT persisting anything (US-057). CANONICAL response: `resumen` + `filas` ' +
    '(ALL rows, no sample cap, with per-row dedup status `esDuplicado` and classification `sugerido`). ' +
    'DEPRECATED fields (removed by US-061 alongside the one-shot endpoint): `estructura` (mirror of ' +
    '`resumen.totalFilas`) and `muestra` (first 50 rows in the old 4-field shape) — kept for shipped ' +
    'clients (deployed mobile APK) and clients pending migration. Requires x-api-key + a valid session; ' +
    'dedup is scoped to the calling user (RNF-SEC-006).',
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

/**
 * `POST /api/ingestas/commit` (US-057, CMT-01..05) — stateless re-upload +
 * edits overlay. The client re-sends the previewed file plus an optional JSON
 * `edits` overlay; the server re-parses, deduplicates, applies the overlay
 * over auto-classification, and persists atomically. Absent/empty edits ⇒
 * pure auto-classify (same result as the deprecated one-shot, without the file
 * metadata response fields). Never persists on overlay-validation errors
 * (D-03/D-04/D-10 — fail-closed).
 *
 * Supersedes `POST /api/ingestas` (deprecated at US-057, D-14/CA-05).
 */
const ingestaCommitOperation: ZodOpenApiOperationObject = {
  summary:
    'Commit a bank statement import with optional edits overlay (US-057)',
  description:
    'Authenticated endpoint — the second step of the preview → commit flow. ' +
    "Re-parses the same file, deduplicates against the calling user's history, applies the " +
    'optional classification overlay (`edits` JSON text field, ≤256 KB), auto-classifies ' +
    'remaining rows, and persists atomically. New duplicates found at commit time are omitted and ' +
    'counted in `duplicadosOmitidos` (commit never aborts on duplicates, CA-03). ' +
    'Absent/empty `edits` ⇒ pure auto-classify (equivalent to the deprecated one-shot for the ' +
    'transacciones payload). Requires x-api-key + a valid session (RNF-SEC-006, per-user isolation). ' +
    'Overlay errors (malformed edits, out-of-range rowIndex, cross-tenant categoriaId) return 400 ' +
    'and persist nothing (D-03/D-04/D-10).',
  requestBody: {
    content: {
      'multipart/form-data': { schema: commitIngestaRequestSchema },
    },
  },
  responses: {
    '201': {
      description:
        'Import committed and persisted. Response carries per-row bucket + categoriaId.',
      content: {
        'application/json': { schema: commitIngestaResponseSchema },
      },
    },
    '400': {
      description:
        'Invalid file (extension, bank, structure, normalization) OR malformed/invalid edits ' +
        '(EdicionesInvalidasError, RowIndexFueraDeRangoError, CategoriaFueraDeCatalogoError). ' +
        'Nothing is persisted. Amounts are scrubbed from every error message (ADR-013).',
    },
    '500': {
      description:
        'Infrastructure fault (DB) — ensure, dedup, catalog load, or persist failure ' +
        '(PersistenciaFallidaError / CategorizacionFallidaError). Retryable.',
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
    'identical 302 redirect (AUTH-15): this contract intentionally does not distinguish them. ' +
    'DUAL MODE (US-041, VINC041-02/03): when `md_oauth` carries a signed `link` marker (set by ' +
    'POST /api/perfil/google/vincular), this same endpoint completes an EXPLICIT LINK instead of a ' +
    "login — it binds a Google identity to the CALLER's own account, issues NO new session, and " +
    'redirects to `/configuracion?google=vinculado` on success or `/configuracion?google=error` on a ' +
    'modelled failure. A `link` marker that fails its integrity check rejects the WHOLE callback to ' +
    'the generic `/login?error=google` — it never falls back to the login path.',
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
    'CAT038-04 as modified by US-039). The delete always succeeds for a category owned by the ' +
    'caller, whether it is referenced by transactions or not. Every Transaccion that referenced the ' +
    'deleted category survives with categoriaId: null and its original bucketId unchanged — no ' +
    'money moves between buckets. Requires x-api-key + a valid session. Rejected for demo sessions.',
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
 * `PATCH /api/perfil` (US-040, design.md §5.5) — updates the caller's own
 * `nombre` and/or `email`. Boundary-validated with `.safeParse()` (D-09,
 * `perfil.routes.ts`). Reuses `authMeResponseSchema` VERBATIM for the `200`
 * — one identity `$ref`, one generated client type shared with
 * `GET /api/auth/me` (design.md Q2).
 */
const perfilUpdateOperation: ZodOpenApiOperationObject = {
  summary: 'Update the current user profile (nombre and/or email)',
  description:
    "Authenticated endpoint that updates the caller's own nombre and/or email (US-040, " +
    'PERF040-01/02/03/04/07). `passwordActual` is REQUIRED whenever `email` is present. On an email ' +
    'change the ciphertext and blind index are rewritten together in one atomic update, so login ' +
    'keeps working with the NEW address and stops working with the old one. A wrong `passwordActual` ' +
    'and an email already claimed by another account return the SAME generic 403 PERFIL_RECHAZADO ' +
    '(anti-enumeration) — 403, never 401: 401 is reserved for an invalid session. Requires ' +
    'x-api-key + a valid session. Rejected for demo sessions (403 DEMO_SOLO_LECTURA).',
  requestBody: {
    content: { 'application/json': { schema: perfilUpdateRequestSchema } },
  },
  responses: {
    '200': {
      description: 'Profile updated; the full updated identity is returned.',
      content: { 'application/json': { schema: authMeResponseSchema } },
    },
    '400': {
      description: 'Malformed body, or an invalid nombre/email.',
      content: { 'application/json': { schema: perfilErrorResponseSchema } },
    },
    '403': {
      description:
        'Demo session, wrong current password, or the email is already in use.',
      content: { 'application/json': { schema: perfilErrorResponseSchema } },
    },
    '401': {
      description: 'No valid session (missing, expired, or invalid token).',
    },
  },
};

/**
 * `PATCH /api/perfil/password` (US-040, design.md §5.5) — changes the
 * caller's own password. Revokes every OTHER active session belonging to
 * the caller's user (PERF040-06) — the caller's own session stays valid.
 * `204` on success: no displayable state changes, so there is no body to
 * return (Q2's asymmetry with `PATCH /api/perfil`).
 */
const perfilPasswordUpdateOperation: ZodOpenApiOperationObject = {
  summary: "Change the current user's password",
  description:
    "Authenticated endpoint that changes the caller's own password (US-040, " +
    'PERF040-03/05/06). `passwordActual` is REQUIRED. On success, EVERY OTHER active ' +
    "session belonging to the caller's user is revoked — the session that made this " +
    'request stays valid. A wrong `passwordActual` returns the SAME generic 403 ' +
    'PERFIL_RECHAZADO used by `PATCH /api/perfil` (anti-enumeration) — 403, never 401: ' +
    '401 is reserved for an invalid session. `passwordNueva` must satisfy the domain ' +
    'password rules (8-128 characters) — an invalid one is rejected with 400 ' +
    'PASSWORD_INVALIDA before any write. Requires x-api-key + a valid session. ' +
    'Rejected for demo sessions (403 DEMO_SOLO_LECTURA).',
  requestBody: {
    content: { 'application/json': { schema: passwordUpdateRequestSchema } },
  },
  responses: {
    '204': {
      description:
        'Password changed. No response body — every other session was revoked.',
    },
    '400': {
      description: 'Malformed body, or an invalid passwordNueva.',
      content: { 'application/json': { schema: perfilErrorResponseSchema } },
    },
    '403': {
      description: 'Demo session, or an incorrect current password.',
      content: { 'application/json': { schema: perfilErrorResponseSchema } },
    },
    '401': {
      description: 'No valid session (missing, expired, or invalid token).',
    },
  },
};

/**
 * `POST /api/perfil/google/vincular` (US-041, VINC041-01, design.md §5.5) —
 * starts the explicit Google link round trip. Reuses `perfilErrorResponseSchema`
 * for every non-2xx body (same `/api/perfil` family, third occurrence —
 * `perfil-google.schema.ts` records the rule-of-three decision).
 */
const perfilGoogleVincularOperation: ZodOpenApiOperationObject = {
  summary: 'Start linking a Google identity to the current account',
  description:
    'Authenticated endpoint (US-041, VINC041-01/02) that re-verifies the current password and starts ' +
    "the OIDC round trip that will bind a Google identity to the CALLER's own account — no email " +
    'matching is involved. Responds with the authorization URL and sets the short-lived `md_oauth` ' +
    'cookie carrying an HMAC-signed link intent; the client performs a top-level navigation to that ' +
    'URL. Completion happens at GET /api/auth/google/callback, which redirects to ' +
    '`/configuracion?google=vinculado` or `/configuracion?google=error` and issues NO new session. ' +
    'Rejected for demo sessions (403 DEMO_SOLO_LECTURA), for a wrong current password (403 ' +
    'PERFIL_RECHAZADO), and when the account already carries a Google identity (409 ' +
    'GOOGLE_YA_VINCULADO — unlink first). 404 when Google login is not active (AUTH-16).',
  requestBody: {
    content: { 'application/json': { schema: vincularGoogleRequestSchema } },
  },
  responses: {
    '200': {
      description:
        'The Google OAuth authorization URL to navigate to. Sets Set-Cookie: md_oauth (state, nonce, codeVerifier, signed link).',
      content: {
        'application/json': { schema: vincularGoogleResponseSchema },
      },
    },
    '400': {
      description: 'Malformed body.',
      content: { 'application/json': { schema: perfilErrorResponseSchema } },
    },
    '403': {
      description: 'Demo session, or an incorrect current password.',
      content: { 'application/json': { schema: perfilErrorResponseSchema } },
    },
    '409': {
      description: 'The account already has a linked Google identity.',
      content: { 'application/json': { schema: perfilErrorResponseSchema } },
    },
    '503': {
      description: 'Google authorization is temporarily unreachable.',
      content: { 'application/json': { schema: perfilErrorResponseSchema } },
    },
    '401': {
      description: 'No valid session (missing, expired, or invalid token).',
    },
    '404': {
      description:
        'Google login is not active — GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET are not both configured (AUTH-16).',
    },
  },
};

/**
 * `POST /api/perfil/google/desvincular` (US-041, VINC041-05, design.md
 * §5.5). No activation gate — unlike vincular, this endpoint stays mounted
 * even when Google login is off, so no 404 branch exists here.
 */
const perfilGoogleDesvincularOperation: ZodOpenApiOperationObject = {
  summary: 'Unlink the Google identity from the current account',
  description:
    'Authenticated endpoint (US-041, VINC041-05) that re-verifies the current password and clears ' +
    "the CALLER's own googleSub. Idempotent: a second call after success still responds 204. " +
    'Rejected for demo sessions (403 DEMO_SOLO_LECTURA), for a wrong current password (403 ' +
    'PERFIL_RECHAZADO), and when the account has no passwordHash (403 VINCULO_REQUIERE_PASSWORD — ' +
    'CA-03: an account may never be left without an access method). Mounted unconditionally, ' +
    'independent of whether Google login is currently active.',
  requestBody: {
    content: {
      'application/json': { schema: desvincularGoogleRequestSchema },
    },
  },
  responses: {
    '204': { description: 'The Google identity is no longer linked.' },
    '400': {
      description: 'Malformed body.',
      content: { 'application/json': { schema: perfilErrorResponseSchema } },
    },
    '403': {
      description:
        'Demo session, an incorrect current password, or the account has no passwordHash to fall back on.',
      content: { 'application/json': { schema: perfilErrorResponseSchema } },
    },
    '401': {
      description: 'No valid session (missing, expired, or invalid token).',
    },
  },
};

const semaforoDetalleOperation: ZodOpenApiOperationObject = {
  summary:
    'Semáforo detail: zone-band edges, diagnosis, and CLP-to-Verde advice',
  description:
    'Authenticated sibling detail endpoint to GET /api/resumen (US-049): exposes the semáforo ' +
    "classification's WHY and WHAT-TO-DO — per-bucket zone-band edges, a backend-generated " +
    'Spanish diagnosis naming the driving bucket(s), and a CLP amount+direction that would ' +
    'return each Amarillo/Rojo bucket to Verde. Requires x-api-key + a valid session ' +
    '(RNF-SEC-006, per-user isolation, ISO-01/ISO-02).',
  requestParams: {
    query: semaforoDetalleQuerySchema,
  },
  responses: {
    '200': {
      description: 'Semáforo detail for the resolved period.',
      content: {
        'application/json': { schema: semaforoDetalleResponseSchema },
      },
    },
    '400': {
      description:
        'Invalid periodo — either a transport-shape mismatch or a malformed YYYY-MM value (domain-level, PeriodoMes VO).',
    },
  },
};

const bucketDetalleMesOperation: ZodOpenApiOperationObject = {
  summary: 'Bucket detail grouped by category for a month',
  description:
    'Authenticated sibling detail endpoint to GET /api/buckets/{bucket} (US-051): returns the ' +
    'month×bucket detail GROUPED by category — a header with totals and % vs meta, and category ' +
    'groups carrying ALL their transactions (BigInt-safe strings, no account PII per MBD-08). ' +
    'Accepts only the four spend buckets (Necesidades, Deseos, Ahorro, SinCategoria); Ingresos ' +
    'is out of scope (US-052) and rejected with a scrubbed 400. Requires x-api-key + a valid ' +
    'session (RNF-SEC-006, per-user isolation, ISO-01/ISO-02).',
  requestParams: {
    path: bucketsPathParamsSchema,
    query: bucketDetalleMesQuerySchema,
  },
  responses: {
    '200': {
      description:
        'Month×bucket detail grouped by category for the resolved period (MBD-01/02/03/05/08).',
      content: {
        'application/json': { schema: bucketDetalleMesResponseSchema },
      },
    },
    '400': {
      description:
        'Invalid bucket (outside the 4-bucket allowlist, e.g. Ingresos) or invalid periodo — both domain-level (BucketInvalidoError / PeriodoInvalidoError), scrubbed messages.',
    },
  },
};

const ingresosMesOperation: ZodOpenApiOperationObject = {
  summary: 'Monthly income list by origin (bank/Manual)',
  description:
    'Authenticated sibling endpoint to GET /api/buckets/{bucket}/detalle (US-052): returns the ' +
    'monthly income detail — a header with the total Σ abono (BigInt-safe string) and count, and ' +
    'ALL transactions with their origin = bank NAME verbatim (CA-02, MID-02) or "Manual", never ' +
    'account PII (tipoCuenta/numeroCuenta, MID-06). Top-level path, NOT a buckets sub-resource: ' +
    'GET /api/buckets/Ingresos/detalle keeps rejecting Ingresos with its own scrubbed 400 (MBD-07, ' +
    'US-051). Requires x-api-key + a valid session (RNF-SEC-006, per-user isolation, ISO-01/ISO-02).',
  requestParams: {
    query: ingresosMesQuerySchema,
  },
  responses: {
    '200': {
      description:
        'Monthly income list for the resolved period — exactly {total, conteo, transacciones} ' +
        'with origen = bank name verbatim or "Manual" (MID-01/02/03/05).',
      content: {
        'application/json': { schema: ingresosMesResponseSchema },
      },
    },
    '400': {
      description:
        'Invalid periodo — malformed YYYY-MM value (domain-level, PeriodoMes VO → ' +
        'PeriodoInvalidoError, MID-04); the scrubbed message never echoes the raw input.',
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
  '/api/perfil': { patch: perfilUpdateOperation },
  '/api/perfil/password': { patch: perfilPasswordUpdateOperation },
  '/api/perfil/google/vincular': { post: perfilGoogleVincularOperation },
  '/api/perfil/google/desvincular': {
    post: perfilGoogleDesvincularOperation,
  },
  '/api/resumen/semaforo': { get: semaforoDetalleOperation },
  '/api/buckets/{bucket}/detalle': { get: bucketDetalleMesOperation },
  '/api/ingresos/mes': { get: ingresosMesOperation },
  '/api/ingestas/commit': { post: ingestaCommitOperation },
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
