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

const variantePredefinida = z
  .object({ perfil: z.enum(PERFILES_PREDEFINIDOS) })
  .strict()
  .meta({
    id: 'PerfilPresupuestoPredefinido',
    description:
      'Predefined profile. 80_10_10 is the «Salir de deudas» profile.',
  });

const variantePersonalizada = z
  .object({ perfil: z.literal('personalizado'), metas: metasSchema })
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
  })
  .meta({
    id: 'PerfilPresupuestoResponse',
    description: "The user's budget profile (issue #110, PER-03..PER-06).",
  });
