import { z } from 'zod';

/**
 * Path param contract for `DELETE /api/ingestas/:id` (openapi-contract-express
 * rollout, Phase 10.2c).
 *
 * TRANSPORT SHAPE ONLY (layer-honesty gate): `id` is any non-empty string.
 * There is no response-body schema for this endpoint — success is `204 No
 * Content` (`res.status(204).send()`, `routes/ingesta.routes.ts`); failure is
 * an anti-enumeration `404 { message }` when the ingesta does not exist or is
 * not owned by the authenticated user (`IngestaNoEncontradaError`).
 */
export const ingestaDeletePathParamsSchema = z.object({
  id: z
    .string()
    .describe(
      'Ingesta id (raw path param). Existence/ownership is checked by the use case, not this schema.',
    ),
});
