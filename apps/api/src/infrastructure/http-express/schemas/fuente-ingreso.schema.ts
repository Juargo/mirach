import { z } from 'zod';

/**
 * fuenteIngresoSchema — source of the income the percentages are measured
 * against (#111, rule 1, VIS-10), shared by every response that carries it.
 */
export const fuenteIngresoSchema = z
  .enum(['declarado', 'detectado'])
  .describe(
    "Source of the percentage base (rule 1, VIS-10): `declarado` when the user declared a monthly income in the budget profile (`PUT /api/perfil/presupuesto`), `detectado` when the base is the sum of the period's credits classified as income.",
  );

/**
 * ingresoBaseShape — the percentage base, its source and the detected income,
 * shared by `/resumen` (each month of `/resumen/anual` too) and
 * `/resumen/semaforo`.
 */
export const ingresoBaseShape = {
  totalIngreso: z
    .string()
    .describe(
      "Income the percentages are measured against (rule 1): the declared monthly income when there is one, otherwise the sum of the period's income credits. BigInt-safe decimal string amount (never a JSON number). See `fuenteIngreso`.",
    ),
  fuenteIngreso: fuenteIngresoSchema,
  ingresoDetectado: z
    .string()
    .describe(
      "Sum of the period's credits classified as income, whatever the source of `totalIngreso`. BigInt-safe decimal string amount (never a JSON number).",
    ),
  sinIngreso: z
    .boolean()
    .describe(
      'true when `totalIngreso` is 0: no declared income and no income credits, so there are no percentages.',
    ),
};
