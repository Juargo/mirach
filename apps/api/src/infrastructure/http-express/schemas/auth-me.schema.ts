import { z } from 'zod';

/**
 * Response contract for `GET /api/auth/me` (AUTH-09, openapi-contract-express
 * rollout Phase 10.2). No query/path params — the identity comes entirely
 * from the session (`req.userId`, set by `sessionMiddleware`).
 *
 * There is no dedicated DTO mapper for this endpoint — `registrarAuthMe`
 * (`routes/auth.routes.ts`) builds the JSON object inline from
 * `IdentidadUsuario` (`application/ports/user-credential-repository.port.ts`).
 * The sync guarantee (spec req #8) is therefore an HTTP-level supertest
 * assertion in `app.auth.spec.ts`, not a unit-level fixture-through-mapper
 * test.
 *
 * LAYER HONESTY: `email` is `string | null` at the transport shape. The
 * domain invariant "a real (non-demo) user MUST have a non-null email" is
 * enforced by `buscarIdentidad` in application/domain — it is deliberately
 * NOT re-encoded here as a Zod cross-field refinement, which would duplicate
 * a rule that already lives one layer down (ADR-005 + DRY).
 */
export const authMeResponseSchema = z
  .object({
    userId: z.string(),
    esDemo: z.boolean(),
    email: z
      .string()
      .nullable()
      .describe(
        'null only for esDemo=true (demo) accounts — a domain invariant, not enforced by this schema.',
      ),
  })
  .meta({
    id: 'AuthMeResponse',
    description:
      'GET /api/auth/me — the authenticated user identity (AUTH-09).',
  });
