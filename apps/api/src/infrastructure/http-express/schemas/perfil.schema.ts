import { z } from 'zod';

/**
 * Transport-shape contract for `PATCH /api/perfil` (US-040, design.md
 * §5.4). LAYER-HONESTY GATE (`categorias.schema.ts` precedent): no
 * `.min()`/`.max()`/`.email()` — `nombre` length (1-80) and `email` format
 * are DOMAIN rules (`NombrePerfilInvalidoError`, the `Email` VO). `.strict()`
 * rejects any extra field (PERF040-07 — a body cannot carry a `userId`).
 *
 * The second `.refine()` is SHAPE ("passwordActual is required when email is
 * present"), not policy — the ANTI-ENUMERATION POLICY (missing collapses to
 * the same rejection as wrong) lives in `ActualizarPerfilUseCase`, the
 * authority. This schema does not restate that reasoning.
 */
export const perfilUpdateRequestSchema = z
  .object({
    nombre: z.string().optional(),
    email: z.string().optional(),
    passwordActual: z.string().optional(),
  })
  .strict()
  .refine((body) => body.nombre !== undefined || body.email !== undefined, {
    message: 'At least one of nombre or email must be present.',
  })
  .refine(
    (body) => body.email === undefined || body.passwordActual !== undefined,
    {
      message: 'passwordActual is required when email is present.',
    },
  );

/**
 * perfilErrorResponseSchema — shared non-2xx body for `/api/perfil*`
 * (US-040, design.md §5.4). Duplicates `catalogoErrorResponseSchema`'s
 * SHAPE but not its knowledge (different code sets, different operations —
 * reusing a type named `CatalogoErrorResponse` here would confuse US-042).
 * Third occurrence ⇒ extract a shared `ErrorResponse` (rule of three, `dry`).
 */
export const perfilErrorResponseSchema = z
  .object({
    message: z.string(),
    code: z.string(),
  })
  .meta({
    id: 'PerfilErrorResponse',
    description: 'Error body for the /api/perfil* endpoints (US-040).',
  });
