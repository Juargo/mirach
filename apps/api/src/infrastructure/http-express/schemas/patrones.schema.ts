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
    moverDelPeriodo: z
      .string()
      .optional()
      .describe(
        'CLA-15: financial month YYYY-MM. When present, saving the pattern and moving the coinciding ' +
          'movements of that month happen in one transaction. Absent ⇒ nothing moves.',
      ),
  })
  .strict();

/**
 * PATCH body — partial, at least one field present (Q4). `categoriaId`
 * moves the pattern to another of the caller's categories (CLA-17, S5); it
 * keeps its id and `creadoEn`. Ownership and the internal-category rule are
 * the use case's. `.strict()` still rejects any unknown field (D-09).
 */
export const patronUpdateRequestSchema = z
  .object({
    patron: z.string().optional(),
    matchType: z.string().optional(),
    prioridad: z.number().optional(),
    categoriaId: z
      .string()
      .optional()
      .describe(
        'CLA-17: move the pattern to this category of the caller. Keeps id and creadoEn.',
      ),
  })
  .strict()
  .refine(
    (body) =>
      body.patron !== undefined ||
      body.matchType !== undefined ||
      body.prioridad !== undefined ||
      body.categoriaId !== undefined,
    {
      message:
        'At least one of patron, matchType, prioridad or categoriaId must be present.',
    },
  );

export const patronIdPathParamsSchema = z.object({
  id: z.string(),
});

/** `POST /api/patrones` 201: the pattern plus how many rows moved (S4). */
export const patronCreateResponseSchema = z
  .object({
    id: z.string(),
    categoriaId: z.string(),
    patron: z.string(),
    matchType: z.string(),
    prioridad: z.number(),
    movidos: z
      .number()
      .int()
      .describe(
        'Movements of moverDelPeriodo moved to the category; 0 without it.',
      ),
  })
  .meta({
    id: 'PatronCreateResponse',
    description:
      'The created pattern (US-038) and how many movements moved with it (CLA-15).',
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

/**
 * The pattern that already holds a text, with its category and bucket
 * (CLA-17). Mirrors `PatronExistente` (domain) — shared by the preview, the
 * 409 `PATRON_DUPLICADO` and the similar-movements suggestion.
 */
export const patronExistenteSchema = z
  .object({
    patronId: z.string(),
    categoriaId: z.string(),
    categoria: z.string().describe('Category name.'),
    bucket: z.string().describe('Bucket name of that category.'),
  })
  .meta({
    id: 'PatronExistente',
    description:
      'The pattern that already holds the text (accent- and case-insensitive, CLA-17), with its category and bucket.',
  });

/**
 * `POST /api/patrones/vista-previa` body (CLA-15). `periodo` is the
 * transport string only — the YYYY-MM rule is the `PeriodoMes` VO's.
 */
export const patronVistaPreviaRequestSchema = z
  .object({
    categoriaId: z.string(),
    patron: z.string().describe('Candidate CONTAINS text.'),
    periodo: z
      .string()
      .optional()
      .describe(
        'Financial month YYYY-MM. Absent ⇒ the last month with data, like other monthly reads.',
      ),
  })
  .strict();

export const patronVistaPreviaResponseSchema = z
  .object({
    periodo: z.string().describe('Resolved financial month YYYY-MM.'),
    patron: z
      .string()
      .describe(
        'The candidate text as the engine compares it (lowercase, no accents).',
      ),
    total: z.number().int().describe('Count of coinciding movements.'),
    coincidencias: z.array(
      z.object({
        id: z.string(),
        descripcion: z.string(),
        fecha: z.string().describe('ISO 8601 UTC.'),
        monto: z.string().describe('Expense amount (cargo), as a string.'),
      }),
    ),
    existente: patronExistenteSchema.nullable(),
  })
  .meta({
    id: 'PatronVistaPreviaResponse',
    description:
      'Movements of the periodo the candidate pattern would move (CLA-15): the engine would pick it; incomes, ' +
      'movements changed by hand and movements already in the category are excluded.',
  });
