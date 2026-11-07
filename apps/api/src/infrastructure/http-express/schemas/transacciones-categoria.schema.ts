import { z } from 'zod';
import { patronExistenteSchema } from './patrones.schema';

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
 * (`routes/transacciones.routes.ts`) coerces a non-string/absent
 * `categoriaId` to `''` so the use case's catalog lookup
 * (`CategoriaDesconocidaError`; ADR-037 — the closed enum gate is retired)
 * rejects it uniformly — that coercion is deliberately NOT re-encoded here as
 * a Zod `z.enum(...)`, which would duplicate a domain rule one layer down
 * (ADR-005 + DRY), and would also change existing error behavior on this
 * sensitive endpoint if wired in as boundary validation.
 *
 * ADR-042 (hard cutover): the field used to be `categoria` (the domain
 * `nombre`) — reversed because, once uniqueness becomes per-bucket, a nombre
 * no longer identifies a single categoría, so name-based resolution could
 * non-deterministically pick the wrong row. There is no transition alias; a
 * legacy `{ categoria: <nombre> }` body fails this schema (missing
 * `categoriaId`).
 */
export const aplicarAParecidosSchema = z
  .object({
    periodo: z
      .string()
      .describe('Financial month YYYY-MM whose similar movements move too.'),
  })
  .strict();

export const transaccionesCategoriaRequestSchema = z.object({
  categoriaId: z
    .string()
    .describe(
      "Categoria id — the caller's OWN Categoria row id, resolved against their own " +
        'catalog by the use case (CategoriaDesconocidaError if it does not resolve or is ' +
        'not theirs), not this schema.',
    ),
  aplicarAParecidos: aplicarAParecidosSchema
    .optional()
    .describe(
      'CLA-03: also create the suggested pattern in this category (or move the existing one ' +
        'here) and move the similar movements of `periodo`, in one transaction. This one IS ' +
        'validated at the route: a malformed value is 400 BODY_INVALIDO.',
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
    movidos: z
      .number()
      .int()
      .describe(
        'Similar movements moved with aplicarAParecidos (CLA-03); 0 without it.',
      ),
  })
  .meta({
    id: 'TransaccionesCategoriaResponse',
    description:
      'PATCH /api/transacciones/:id/categoria — manual reclassification result (US-013 S4).',
  });

/** `GET /api/transacciones/{id}/parecidos` query (CLA-03, S6). */
export const transaccionesParecidosQuerySchema = z.object({
  categoriaId: z.string().describe('Target category the person is choosing.'),
  periodo: z
    .string()
    .optional()
    .describe('Financial month YYYY-MM. Absent ⇒ the last month with data.'),
});

export const transaccionesParecidosResponseSchema = z
  .object({
    patron: z
      .string()
      .nullable()
      .describe(
        'Suggested CONTAINS text from the glosa, or null when there is nothing to offer ' +
          '(fewer than 3 letters, or an internal category).',
      ),
    total: z
      .number()
      .int()
      .describe(
        'OTHER movements of the periodo that would move with the suggestion.',
      ),
    existente: patronExistenteSchema.nullable(),
  })
  .meta({
    id: 'TransaccionesParecidosResponse',
    description:
      'Suggested pattern for a reclassification and how many other movements would follow it (CLA-03).',
  });
