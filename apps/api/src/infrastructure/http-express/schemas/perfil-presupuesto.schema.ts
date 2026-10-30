import { z } from 'zod';

/**
 * Transport-shape contracts for `GET/PUT /api/perfil/presupuesto` (#110,
 * ADR-005 §7). LAYER-HONESTY GATE (`perfil.schema.ts` precedent): no
 * `.min()`/`.max()` on the goals and no sum check — "non-negative" and "sum
 * 10000" are DOMAIN rules (`MetaPresupuestoInvalidaError`,
 * `PerfilNoSuma100Error`). Integers are shape: goals are basis points.
 * `.strict()` rejects any extra field.
 */

const PERFILES_PREDEFINIDOS = [
  '50_30_20',
  '60_20_20',
  '70_15_15',
  '80_10_10',
] as const;

const metasSchema = z
  .object({
    Necesidades: z.number().int(),
    Deseos: z.number().int(),
    Ahorro: z.number().int(),
  })
  .strict()
  .meta({ id: 'PerfilPresupuestoMetas' });

/**
 * Financial month fields (#111, PER-02, PER-08), optional on both branches:
 * left out = unchanged, `ingresoDeclarado: null` clears it. "1 to 28" and
 * "positive" are DOMAIN rules (`DiaCorteInvalidoError`,
 * `IngresoDeclaradoInvalidoError`); the amount is a decimal string
 * (BigInt-safe DTOs) of at most 18 digits so it always fits a BIGINT.
 */
const mesFinancieroCampos = {
  diaCorte: z
    .number()
    .int()
    .optional()
    .describe(
      'Cut-off day of the financial month, 1 to 28 (1 = calendar month). Left out = unchanged.',
    ),
  ingresoDeclarado: z
    .string()
    .regex(/^\d{1,18}$/)
    .nullable()
    .optional()
    .describe(
      'Declared monthly net income in CLP as a decimal string, positive. null clears it; left out = unchanged.',
    ),
};

const variantePredefinida = z
  .object({ perfil: z.enum(PERFILES_PREDEFINIDOS), ...mesFinancieroCampos })
  .strict()
  .meta({
    id: 'PerfilPresupuestoPredefinido',
    description:
      'Predefined profile. 80_10_10 is the «Salir de deudas» profile.',
  });

const variantePersonalizada = z
  .object({
    perfil: z.literal('personalizado'),
    metas: metasSchema,
    ...mesFinancieroCampos,
  })
  .strict()
  .meta({
    id: 'PerfilPresupuestoPersonalizado',
    description:
      'Custom profile: three non-negative targets in basis points that must sum 10000.',
  });

/** Runtime validation of the PUT body: one branch per `perfil` value. */
export const perfilPresupuestoUpdateRequestSchema = z.discriminatedUnion(
  'perfil',
  [variantePredefinida, variantePersonalizada],
);

/**
 * Document schema of the PUT body. Same branches as a `z.union` (emits
 * `anyOf`) — the `registrarMovimientoManualRequestOpenApiSchema` precedent:
 * zod-openapi emits anonymous `oneOf` branches for `z.discriminatedUnion`,
 * which the Kotlin generator cannot name. The branches are mutually
 * exclusive by `perfil`.
 */
export const perfilPresupuestoUpdateRequestOpenApiSchema = z
  .union([variantePredefinida, variantePersonalizada])
  .meta({
    id: 'PerfilPresupuestoUpdateRequest',
    description:
      'A predefined profile id, or `personalizado` with three targets in basis points that must sum 10000. The branches are mutually exclusive by `perfil`.',
  });

export const perfilPresupuestoResponseSchema = z
  .object({
    perfil: z
      .enum([...PERFILES_PREDEFINIDOS, 'personalizado'])
      .describe(
        'Budget profile id. 80_10_10 is shown as «Salir de deudas». 50_30_20 for a user who never chose one.',
      ),
    metas: z
      .object({
        Necesidades: z.number().int().min(0).max(10000),
        Deseos: z.number().int().min(0).max(10000),
        Ahorro: z.number().int().min(0).max(10000),
      })
      .describe(
        'Targets in basis points (5000 = 50%); they sum 10000. The summaries measure every month against them, past ones too.',
      ),
    diaCorte: z
      .number()
      .int()
      .min(1)
      .max(28)
      .describe(
        'Cut-off day of the financial month (1 = calendar month, the default). Period YYYY-MM starts on this day of that month; changing it recalculates every month.',
      ),
    ingresoDeclarado: z
      .string()
      .nullable()
      .describe(
        'Declared monthly net income in CLP as a decimal string, or null when not declared. When present, the summaries use it as the base of the percentages.',
      ),
  })
  .meta({
    id: 'PerfilPresupuestoResponse',
    description:
      "The user's budget profile (issue #110, PER-03..PER-06) and financial month (issue #111, PER-02, PER-08).",
  });
