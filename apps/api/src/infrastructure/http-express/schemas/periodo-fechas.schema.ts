import { z } from 'zod';

const fechaSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);

/**
 * fechasPeriodoShape — start and end dates of a financial month (#111), shared
 * by every monthly response so they describe the period the same way.
 */
export const fechasPeriodoShape = {
  fechaInicio: fechaSchema.describe(
    "First day of the financial month, YYYY-MM-DD, inclusive. It is the user's cut-off day of the month named by `periodo` (cut-off 25: 2026-10 starts on 2026-10-25); with cut-off 1 it is the first day of the calendar month.",
  ),
  fechaFin: fechaSchema.describe(
    'Last day of the financial month, YYYY-MM-DD, inclusive: the day before the next period starts (cut-off 25: 2026-10 ends on 2026-11-24).',
  ),
};
