import { z } from 'zod';

/**
 * Query contract for `GET /api/resumen` (openapi-contract-express Slice 1).
 *
 * TRANSPORT SHAPE ONLY (openapi-contract-express design, layer-honesty gate):
 * `periodo` is an optional string. Absent means "use current month"
 * (`CalcularResumenMesUseCase` default). The YYYY-MM format rule is a DOMAIN
 * rule (`PeriodoMes` VO → `PeriodoInvalidoError`, ADR-005 + DRY) and MUST NOT
 * be duplicated here — a malformed-but-string `periodo` still reaches the
 * use case and gets the existing scrubbed 400.
 */
export const resumenQuerySchema = z.object({
  periodo: z
    .string()
    .optional()
    .describe(
      'Month period, format YYYY-MM (e.g. 2026-07). Absent defaults to the current month. Format is validated by the domain, not this schema.',
    ),
});

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
  estadoSemaforo: z
    .enum(['verde', 'amarillo', 'rojo'])
    .nullable()
    .describe(
      'Traffic-light health state, lowercase wire enum (US-016), or null.',
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
    totalIngreso: z
      .string()
      .describe('BigInt-safe decimal string amount (never a JSON number).'),
    sinIngreso: z.boolean(),
    buckets: z
      .array(bucketResumenSchema)
      .describe('Always 4 entries: Necesidades, Deseos, Ahorro, SinCategoria.'),
    targets: z
      .object({
        Necesidades: z.number(),
        Deseos: z.number(),
        Ahorro: z.number(),
      })
      .describe('Hardcoded 50/30/20 reference targets.'),
    estadoGlobal: z
      .enum(['verde', 'amarillo', 'rojo'])
      .nullable()
      .describe('Worst traffic-light state across measured buckets, or null.'),
    cantidadSinCategoria: z
      .number()
      .int()
      .nonnegative()
      .describe(
        'US-045: count of uncategorized cargo transactions (row count, not money). Always present.',
      ),
  })
  .meta({
    id: 'ResumenMesResponse',
    description: 'GET /api/resumen — 50/30/20 monthly breakdown (US-015/016).',
  });
