import { z } from 'zod';

/**
 * Query contract for `GET /api/resumen/semaforo` (US-049, design §1.6).
 *
 * TRANSPORT SHAPE ONLY (same layer-honesty gate as `resumen.schema.ts`):
 * `periodo` is an optional string. The YYYY-MM format rule is a DOMAIN rule
 * (`PeriodoMes` VO → `PeriodoInvalidoError`) and MUST NOT be duplicated here.
 */
export const semaforoDetalleQuerySchema = z.object({
  periodo: z
    .string()
    .optional()
    .describe(
      'Month period, format YYYY-MM (e.g. 2026-07). Absent defaults to the current month. Format is validated by the domain, not this schema.',
    ),
});

/**
 * Response contract for a single spend bucket's zone bands (mirrors
 * `BandasBucket`, `domain/value-objects/estado-semaforo.ts`). `verdeMin`/
 * `amarilloMin` are `null` for unilateral buckets (Necesidades/Deseos).
 */
const bandasSemaforoSchema = z.object({
  verdeMin: z.number().int().nullable(),
  verdeMax: z.number().int(),
  amarilloMin: z.number().int().nullable(),
  amarilloMax: z.number().int(),
});

/**
 * Response contract for a bucket's CLP-to-Verde advice (mirrors
 * `ConsejoVerde`, `domain/value-objects/semaforo-detalle.ts`). `monto` is a
 * BigInt-safe decimal string — money never travels as a JSON number
 * (the money-guard-at-the-boundary lesson).
 */
const consejoVerdeSchema = z.object({
  direccion: z.enum(['reducir', 'aumentar']),
  monto: z
    .string()
    .describe('BigInt-safe decimal string amount (never a JSON number).'),
  mensaje: z
    .string()
    .describe(
      'Spanish sentence containing the literal `{monto}` placeholder exactly once (SEM-10).',
    ),
});

/**
 * Response contract for a single spend bucket entry (mirrors
 * `SemaforoDetalleDto['buckets'][number]`, `infrastructure/http/dto/
 * semaforo-detalle.dto.ts`).
 */
const bucketSemaforoDetalleSchema = z.object({
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
    .describe('Traffic-light health state, lowercase wire enum, or null.'),
  metaBp: z
    .number()
    .int()
    .describe("Bucket's 50/30/20 target center, in basis points (SEM-02)."),
  bandas: bandasSemaforoSchema.describe(
    'Zone-band edges used to compute this estado, sourced from the single BANDAS_SEMAFORO table (SEM-02).',
  ),
  consejo: consejoVerdeSchema
    .nullable()
    .describe(
      'CLP-to-Verde advice (SEM-03/SEM-04). null when estadoSemaforo is verde or null.',
    ),
});

/**
 * Response contract for `GET /api/resumen/semaforo` (mirrors
 * `SemaforoDetalleDto`, `infrastructure/http/dto/semaforo-detalle.dto.ts`).
 * The `aSemaforoDetalleDto()` mapper is the sync guarantee this schema is
 * checked against — see `semaforo-detalle.schema.spec.ts`.
 */
export const semaforoDetalleResponseSchema = z
  .object({
    periodo: z.string().describe('Resolved period, format YYYY-MM.'),
    totalIngreso: z
      .string()
      .describe('BigInt-safe decimal string amount (never a JSON number).'),
    sinIngreso: z.boolean(),
    estadoGlobal: z
      .enum(['verde', 'amarillo', 'rojo'])
      .nullable()
      .describe(
        'Worst traffic-light state across the 3 spend buckets, or null.',
      ),
    diagnostico: z
      .string()
      .describe(
        'Backend-generated Spanish sentence naming the driving bucket(s) (SEM-01). Never contains {monto}.',
      ),
    bucketsCriticos: z
      .array(z.string())
      .describe(
        'Bucket names sharing estadoGlobal severity. [] when Verde or sinIngreso.',
      ),
    buckets: z
      .array(bucketSemaforoDetalleSchema)
      .describe(
        'Always exactly 3 entries: Necesidades, Deseos, Ahorro (D-03).',
      ),
    sinCategoria: z
      .object({
        cantidad: z.number().int().nonnegative(),
        total: z
          .string()
          .describe('BigInt-safe decimal string amount (never a JSON number).'),
      })
      .describe(
        'Re-exposed from /api/resumen, never recomputed independently (SEM-05).',
      ),
  })
  .meta({
    id: 'SemaforoDetalleResponse',
    description:
      'GET /api/resumen/semaforo — semáforo detail: zone-band edges, diagnosis, and CLP-to-Verde advice (US-049).',
  });
