import { z } from 'zod';
import { fechasPeriodoShape } from './periodo-fechas.schema';
import { ingresoBaseShape } from './fuente-ingreso.schema';

/**
 * Query contract for `GET /api/resumen` (openapi-contract-express Slice 1).
 *
 * TRANSPORT SHAPE ONLY (openapi-contract-express design, layer-honesty gate):
 * `periodo` is an optional string. Absent means "use the latest month with
 * data for this user" (`resolverPeriodo` default, issue #747; falls back to
 * the current month only when the user has no transactions at all). The
 * YYYY-MM format rule is a DOMAIN
 * rule (`PeriodoMes` VO → `PeriodoInvalidoError`, ADR-005 + DRY) and MUST NOT
 * be duplicated here — a malformed-but-string `periodo` still reaches the
 * use case and gets the existing scrubbed 400.
 */
export const resumenQuerySchema = z.object({
  periodo: z
    .string()
    .optional()
    .describe(
      'Month period, format YYYY-MM (e.g. 2026-07). Absent defaults to the latest month with at least one transaction for this user, falling back to the current month when the user has none (issue #747). Format is validated by the domain, not this schema.',
    ),
});

/** Rule 9 states (issue #113), lowercase wire enum, or null. */
const estadoBloqueSchema = z.enum(['bien', 'cerca', 'sobre']).nullable();

/**
 * Response contract for a single spend bucket slice (mirrors
 * `BucketResumenDto`, `infrastructure/http/dto/resumen-mes.dto.ts`).
 */
const bucketResumenSchema = z.object({
  bucket: z.string().describe('Bucket name (Bucket domain enum value).'),
  total: z
    .string()
    .describe('BigInt-safe decimal string amount (never a JSON number).'),
  porcentajeBp: z
    .number()
    .int()
    .nullable()
    .describe('Basis-point percentage (0-10000). null when sinIngreso=true.'),
  participacionGastoBp: z
    .number()
    .int()
    .min(0)
    .max(10000)
    .nullable()
    .describe(
      "This bucket's share of the month's TOTAL SPEND (the sum of `total` over the 3 buckets of this response), in basis points (0-10000), for pie charts. Across the 3 buckets the values sum to exactly 10000 (largest-remainder rounding; ties go to the earlier bucket in `buckets`). null on every bucket when total spend is 0. Unlike `porcentajeBp`, whose base is the month's income (`totalIngreso`) and which is null when sinIngreso=true, this is independent of income.",
    ),
  metaBp: z
    .number()
    .int()
    .min(0)
    .max(10000)
    .describe(
      "Target of this bucket in basis points, from the user's budget profile (issue #110). Every month uses the current profile, past ones too. 5000/3000/2000 for the default 50/30/20 profile.",
    ),
  estadoSemaforo: z
    .enum(['verde', 'amarillo', 'rojo'])
    .nullable()
    .describe(
      'Traffic-light health state, lowercase wire enum (US-016), or null. The bands move with the profile target (issue #110): Necesidades and Deseos are verde up to `metaBp` and amarillo up to `metaBp` + 1000; Ahorro is verde from `metaBp` to `metaBp` + 2000 and amarillo from `metaBp` - 1000 to `metaBp` + 3000.',
    ),
  estado: estadoBloqueSchema.describe(
    'Rule 9 state of this block (issue #113): bien when it meets its target, cerca when it deviates 5 points or less in the unfavorable direction, sobre when it deviates more. For Ahorro, below the target is unfavorable. null when sinIngreso=true.',
  ),
});

/**
 * Response contract for `GET /api/resumen` (mirrors `ResumenMesDto`,
 * `infrastructure/http/dto/resumen-mes.dto.ts`). The `aResumenMesDto()`
 * mapper is the sync guarantee this schema is checked against — see
 * `resumen.schema.spec.ts`.
 */
export const resumenResponseSchema = z
  .object({
    periodo: z.string().describe('Resolved period, format YYYY-MM.'),
    ...fechasPeriodoShape,
    ...ingresoBaseShape,
    buckets: z
      .array(bucketResumenSchema)
      .describe(
        'Always 3 entries: Necesidades, Deseos, Ahorro. SinCategoria was removed (issue #778 tramo 5b PR5) — this is a BREAKING change from the previous 4-entry shape.',
      ),
    targets: z
      .object({
        Necesidades: z.number(),
        Deseos: z.number(),
        Ahorro: z.number(),
      })
      .describe(
        "Targets of the user's budget profile in percentage points (issue #110), for example 80/10/10. `buckets[].metaBp` carries the same targets in basis points.",
      ),
    estadoGlobal: z
      .enum(['verde', 'amarillo', 'rojo'])
      .nullable()
      .describe('Worst traffic-light state across measured buckets, or null.'),
    estadoMes: estadoBloqueSchema.describe(
      'Month state (issue #113, VIS-11): the worst `estado` of the 3 buckets. null when sinIngreso=true.',
    ),
    bloquesEstadoMes: z
      .array(z.string())
      .describe(
        'Bucket ids tied at the worst state, in `buckets` order, that define `estadoMes` (VIS-03). Empty when estadoMes is bien or null.',
      ),
  })
  .meta({
    id: 'ResumenMesResponse',
    description: 'GET /api/resumen — 50/30/20 monthly breakdown (US-015/016).',
  });
