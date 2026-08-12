import { z } from 'zod';

/**
 * Transport-shape contracts for `/api/patrones` (US-038, design.md
 * §5.2/§7.2). LAYER-HONESTY GATE: `matchType` membership is a DOMAIN rule
 * (`MatchTypeInvalidoError`) — stays `z.string()`. `patron` length,
 * `prioridad` range/default all live in the use case.
 */
export const patronCreateRequestSchema = z
  .object({
    categoriaId: z.string(),
    patron: z.string(),
    matchType: z.string(),
    prioridad: z.number().optional(),
  })
  .strict();

/**
 * PATCH body — partial, at least one field present (Q4). `categoriaId` is
 * intentionally NOT accepted: moving a pattern between categories is a
 * non-goal (design.md §5.1), and `.strict()` makes a caller that tries it
 * fail loudly instead of being silently ignored (D-09).
 */
export const patronUpdateRequestSchema = z
  .object({
    patron: z.string().optional(),
    matchType: z.string().optional(),
    prioridad: z.number().optional(),
  })
  .strict()
  .refine(
    (body) =>
      body.patron !== undefined ||
      body.matchType !== undefined ||
      body.prioridad !== undefined,
    {
      message:
        'At least one of patron, matchType or prioridad must be present.',
    },
  );

export const patronIdPathParamsSchema = z.object({
  id: z.string(),
});

/**
 * Response contract for a single patrón (mirrors `PatronDto`,
 * `infrastructure/http/dto/patron.dto.ts`) — reused nested (inside
 * `CategoriaResponse.patrones`, see `categorias.schema.ts`) and standalone
 * (the `POST`/`PATCH /api/patrones` responses). `aPatronDto()` is the sync
 * guarantee this schema is checked against (`patrones.schema.spec.ts`).
 */
export const patronResponseSchema = z
  .object({
    id: z.string(),
    categoriaId: z.string(),
    patron: z.string(),
    matchType: z.string(),
    prioridad: z.number(),
  })
  .meta({
    id: 'PatronResponse',
    description: 'A classification pattern (US-038).',
  });
