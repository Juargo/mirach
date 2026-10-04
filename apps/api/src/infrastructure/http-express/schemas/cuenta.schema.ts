import { z } from 'zod';

/**
 * Transport-shape contract for `DELETE /api/cuenta`. LAYER-HONESTY GATE: no
 * `.literal('ELIMINAR')` here — the exact confirmation value is a DOMAIN rule
 * (`ConfirmacionEliminacionInvalidaError`). `confirmacion` is optional at the
 * transport level so a missing field and a wrong one collapse into the same
 * domain error. `.strict()` rejects any extra field (a body cannot carry a
 * `userId`: the account to delete always comes from the session).
 */
export const cuentaDeleteRequestSchema = z
  .object({
    confirmacion: z
      .string()
      .optional()
      .describe('Must be exactly "ELIMINAR" to confirm the deletion.'),
  })
  .strict();

/** Non-2xx body for `DELETE /api/cuenta`. */
export const cuentaErrorResponseSchema = z
  .object({
    message: z.string(),
    code: z.string(),
  })
  .meta({
    id: 'CuentaErrorResponse',
    description: 'Error body for DELETE /api/cuenta.',
  });
