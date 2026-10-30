import { z } from 'zod';
import { fechasPeriodoShape } from './periodo-fechas.schema';

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
        'Financial months (YYYY-MM, the month each period starts in with the user cut-off day, #111) with at least one movement (expense or income) for this user, MOST RECENT FIRST, no duplicates. Empty when the user has no movements.',
      ),
    rangos: z
      .array(
        z
          .object({
            periodo: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
            ...fechasPeriodoShape,
          })
          .strict(),
      )
      .describe(
        'The same periods as `periodos`, in the same order, with the start and end dates of each financial month (#111).',
      ),
  })
  .strict()
  .meta({
    id: 'PeriodosResponse',
    description:
      'GET /api/periodos — months that have movements for the session user (month selector).',
  });
