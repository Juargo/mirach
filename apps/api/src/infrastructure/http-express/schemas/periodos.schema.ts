import { z } from 'zod';

/**
 * Response contract for `GET /api/periodos`: the months in which the session
 * user has at least one movement, for the month selector. `.strict()` →
 * additionalProperties: false.
 */
export const periodosResponseSchema = z
  .object({
    periodos: z
      .array(z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/))
      .describe(
        'Months (YYYY-MM, UTC) with at least one movement (expense or income) for this user, MOST RECENT FIRST, no duplicates. Empty when the user has no movements.',
      ),
  })
  .strict()
  .meta({
    id: 'PeriodosResponse',
    description:
      'GET /api/periodos — months that have movements for the session user (month selector).',
  });
