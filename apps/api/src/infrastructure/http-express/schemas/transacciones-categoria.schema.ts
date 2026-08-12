import { z } from 'zod';

/**
 * Path param contract for `PATCH /api/transacciones/:id/categoria` (US-013
 * S4, openapi-contract-express rollout Phase 10.2b — writes/sensitive
 * group).
 *
 * TRANSPORT SHAPE ONLY (layer-honesty gate, mirrors `bucketsPathParamsSchema`
 * / `ingestaDeletePathParamsSchema`): `id` is any non-empty string. Express
 * guarantees path params are always strings, so this is NEVER
 * `.safeParse()`'d at the route — it exists only for OpenAPI documentation
 * completeness. Existence/ownership (`TransaccionNoEncontradaError` →
 * anti-enumeration 404) is a domain/application concern.
 */
export const transaccionesCategoriaPathParamsSchema = z.object({
  id: z
    .string()
    .describe(
      'Transaction id (raw path param). Existence/ownership is checked by the use case, not this schema.',
    ),
});

/**
 * Request body contract. CONTRACT-ONLY (design decision): this schema
 * documents the transport shape for the OpenAPI doc; it is NEVER
 * `.safeParse()`'d at the route. `registrarTransacciones`
 * (`routes/transacciones.routes.ts`) coerces a non-string/absent `categoria`
 * to `''` so the use case's catalog lookup (`CategoriaDesconocidaError`;
 * ADR-037 — the closed enum gate is retired) rejects it uniformly — that
 * coercion is deliberately NOT re-encoded here as a Zod `z.enum(...)`, which
 * would duplicate a domain rule one layer down (ADR-005 + DRY), and would
 * also change existing error behavior on this sensitive endpoint if wired in
 * as boundary validation.
 */
export const transaccionesCategoriaRequestSchema = z.object({
  categoria: z
    .string()
    .describe(
      'Category name (e.g. "Supermercado"), resolved against the caller\'s own catalog ' +
        '(ADR-036/ADR-037 — no closed enum) by the use case (CategoriaDesconocidaError if it ' +
        'does not resolve), not this schema.',
    ),
});

/**
 * Response contract for the 200 success case (mirrors
 * `ReclasificarCategoriaResponseDto`,
 * `infrastructure/http/dto/reclasificar-categoria.dto.ts`). No money fields
 * — `aReclasificarCategoriaDto()` is the sync guarantee this schema is
 * checked against.
 */
export const transaccionesCategoriaResponseSchema = z
  .object({
    id: z.string(),
    categoria: z.object({
      id: z.string(),
      nombre: z.string(),
    }),
    bucket: z.string().describe('Derived bucket name (echo, not raw input).'),
  })
  .meta({
    id: 'TransaccionesCategoriaResponse',
    description:
      'PATCH /api/transacciones/:id/categoria — manual reclassification result (US-013 S4).',
  });
