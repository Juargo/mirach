import { z } from 'zod';

/**
 * Path param contract for `GET /api/buckets/:bucket` (openapi-contract-express
 * rollout, Phase 10).
 *
 * TRANSPORT SHAPE ONLY (layer-honesty gate): `bucket` is any non-empty
 * string. The valid-bucket enum check is a DOMAIN rule
 * (`ObtenerDetalleBucketUseCase` → `BucketInvalidoError`) and MUST NOT be
 * duplicated here — an unrecognized bucket name still reaches the use case
 * and gets the existing scrubbed 400.
 */
export const bucketsPathParamsSchema = z.object({
  bucket: z
    .string()
    .describe(
      'Bucket name (raw path param). Validated against the domain enum by the use case, not this schema.',
    ),
});

/**
 * Query contract for `GET /api/buckets/:bucket` — mirrors `resumen.schema.ts`
 * (transport shape only, YYYY-MM format stays a domain rule).
 */
export const bucketsQuerySchema = z.object({
  periodo: z
    .string()
    .optional()
    .describe(
      'Month period, format YYYY-MM (e.g. 2026-07). Absent defaults to the current month. Format is validated by the domain, not this schema.',
    ),
});

const categoriaSchema = z
  .object({
    id: z.string(),
    nombre: z.string(),
  })
  .nullable()
  .describe('Folded category, or null for Ingreso/SinCategoria rows.');

const bucketTransaccionSchema = z.object({
  id: z.string(),
  fecha: z.string().describe('ISO-8601 UTC timestamp.'),
  descripcion: z.string(),
  cargo: z
    .string()
    .describe('BigInt-safe decimal string amount (never a JSON number).'),
  abono: z
    .string()
    .describe('BigInt-safe decimal string amount (never a JSON number).'),
  banco: z.string(),
  tipoCuenta: z.string(),
  numeroCuenta: z.string(),
  categoria: categoriaSchema,
});

/**
 * Response contract for `GET /api/buckets/:bucket` (mirrors `DetalleBucketDto`,
 * `infrastructure/http/dto/detalle-bucket.dto.ts`). The `aDetalleBucketDto()`
 * mapper is the sync guarantee this schema is checked against — see
 * `buckets.schema.spec.ts`.
 */
export const bucketsResponseSchema = z
  .object({
    periodo: z.string().describe('Resolved period, format YYYY-MM.'),
    bucket: z.string().describe('Validated bucket name (echo, not raw input).'),
    transacciones: z.array(bucketTransaccionSchema),
  })
  .meta({
    id: 'DetalleBucketResponse',
    description: 'GET /api/buckets/:bucket — bucket drill-down (US-017).',
  });
