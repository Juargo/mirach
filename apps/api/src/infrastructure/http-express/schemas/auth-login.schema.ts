import { z } from 'zod';

/**
 * Request contract for `POST /api/auth/login` (AUTH-01, openapi-contract-express
 * rollout Phase 10.2b — writes/sensitive group).
 *
 * CONTRACT-ONLY (design decision): this schema exists to DOCUMENT the
 * transport shape in the OpenAPI doc; it is NEVER `.safeParse()`'d at the
 * route. Auth is the most sensitive endpoint group in the rollout —
 * `registrarAuthPublic` (`routes/auth.routes.ts`) still casts `req.body` by
 * hand exactly as before this schema existed, preserving existing behavior
 * (no runtime validation is added here).
 */
export const authLoginRequestSchema = z.object({
  email: z.string(),
  password: z.string(),
});

/**
 * Response contract for the 200 success case. There is no dedicated DTO
 * mapper for login — `registrarAuthPublic` builds the literal object inline
 * from `LoginUseCaseResult`. `expiresAt` is `.toISOString()`'d at the route,
 * so the transport shape is a string, never a `Date`.
 */
export const authLoginResponseSchema = z
  .object({
    token: z.string(),
    userId: z.string(),
    expiresAt: z.string().describe('ISO-8601 UTC timestamp.'),
  })
  .meta({
    id: 'AuthLoginResponse',
    description: 'POST /api/auth/login — successful authentication (AUTH-01).',
  });
