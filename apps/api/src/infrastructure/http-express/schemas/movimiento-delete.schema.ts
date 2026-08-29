import { z } from 'zod';

/**
 * Path param contract for `DELETE /api/movimientos/:id`
 * (correccion-movimientos-manuales, D-01b).
 *
 * TRANSPORT SHAPE ONLY (layer-honesty gate, mirrors
 * `ingestaDeletePathParamsSchema`): `id` is any non-empty string. Express
 * guarantees path params are always strings, so this is NEVER
 * `.safeParse()`'d at the route — it exists only for OpenAPI documentation
 * completeness (`requestParams.path`). There is no response-body schema for
 * this endpoint — success is `204 No Content`; failure is an
 * anti-enumeration `404 { message }` when the transaction does not exist, is
 * not owned by the authenticated user, or is not `origen='Manual'`
 * (`TransaccionNoEncontradaError`).
 */
export const movimientoDeletePathParamsSchema = z.object({
  id: z
    .string()
    .describe(
      'Transaccion id (raw path param). Existence/ownership/provenance is checked by the use case, not this schema.',
    ),
});
