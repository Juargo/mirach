import { z } from 'zod';

/**
 * Request contract for `POST /api/auth/google/token` (AUTH-19, ADR-035 M1).
 *
 * CONTRACT-ONLY (same decision as `auth-login.schema.ts`): this schema exists
 * to DOCUMENT the transport shape in the OpenAPI doc; it is NEVER
 * `.safeParse()`'d at the route. `registrarAuthGoogleToken`
 * (`routes/auth-google-token.routes.ts`) casts `req.body` by hand, mirroring
 * `/auth/login`'s body handling exactly (`typeof body?.idToken === 'string'
 * ? body.idToken : ''`, no 400 — every bad shape takes the generic 401 path).
 *
 * Deliberately NO `nonce` field (AUTH-23, design §11.1 regression pin): the
 * mobile flow accepts no server-side nonce. `z.object()` (not `.strict()`)
 * means an unexpected `nonce` key is silently stripped, never rejected —
 * pinning the accepted no-nonce tradeoff so it cannot regress into a
 * required-nonce contract by accident.
 */
export const authGoogleTokenRequestSchema = z.object({
  idToken: z.string(),
});
