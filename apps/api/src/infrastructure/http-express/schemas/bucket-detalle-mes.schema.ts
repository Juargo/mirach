import { z } from 'zod';
import { bucketsPathParamsSchema } from './buckets.schema';

/**
 * Path params for `GET /api/buckets/:bucket/detalle` — SAME path segment as
 * the flat route (`/api/buckets/:bucket`), so we REUSE
 * `bucketsPathParamsSchema` instead of redeclaring it (D-07, DRY): transport
 * shape only — `bucket` es cualquier string no vacío; el enum válido es regla
 * de dominio (`ObtenerDetalleBucketMesUseCase` → `BucketInvalidoError`) y no
 * se duplica aquí.
 */
export const bucketDetalleMesPathParamsSchema = bucketsPathParamsSchema;

/**
 * Query contract for `GET /api/buckets/:bucket/detalle` — mirrors
 * `bucketsQuerySchema` (transport shape only, YYYY-MM format stays a domain
 * rule via `PeriodoMes` → `PeriodoInvalidoError`, MBD-04).
 */
export const bucketDetalleMesQuerySchema = z.object({
  periodo: z
    .string()
    .optional()
    .describe(
      'Month period, format YYYY-MM (e.g. 2026-07). Absent defaults to the current month. Format is validated by the domain, not this schema.',
    ),
});

/**
 * Transaction entry in a category group (MBD-02): {id, fecha, descripcion,
 * origen, monto} — `.strict()` hard-rejects any extra key (a stray
 * `tipoCuenta`/`numeroCuenta` fails parse): MBD-08 becomes a wire guarantee
 * (additionalProperties: false in the generated OpenAPI) for ACCOUNT PII,
 * not just a mapper discipline. `origen` (bank name verbatim, or `'Manual'`)
 * is deliberately part of the wire — it is the `esManual` signal WEB-DEL-01
 * needs, mirroring `origen` on `IngresosMesDto` (D-02,
 * correccion-movimientos-manuales).
 */
const transaccionDetalleMesSchema = z
  .object({
    id: z.string(),
    fecha: z.string().describe('ISO-8601 UTC timestamp.'),
    descripcion: z.string(),
    origen: z
      .string()
      .describe(
        "Bank name verbatim, or 'Manual' for a hand-entered movement (D-02). Drives the delete affordance on manual rows (WEB-DEL-01).",
      ),
    monto: z
      .string()
      .describe('BigInt-safe decimal string amount (never a JSON number).'),
  })
  .strict();

/**
 * Category group with its complete transaction list (MBD-02 — never
 * truncated or paged). `categoriaId` null only for the synthetic
 * "Sin categoría" group.
 */
const grupoDetalleMesSchema = z.object({
  categoriaId: z.string().nullable().describe('null for the synthetic group.'),
  nombre: z.string(),
  subtotal: z
    .string()
    .describe('BigInt-safe decimal string amount (never a JSON number).'),
  conteo: z.number().int().nonnegative(),
  transacciones: z
    .array(transaccionDetalleMesSchema)
    .describe('Complete list — never truncated or paged (MBD-02).'),
});

/**
 * Response contract for `GET /api/buckets/:bucket/detalle` (mirrors
 * `DetalleBucketMesDto`, `infrastructure/http/dto/detalle-bucket-mes.dto.ts`).
 * The `aDetalleBucketMesDto()` mapper is the sync guarantee this schema is
 * checked against — see `bucket-detalle-mes.schema.spec.ts`.
 */
export const bucketDetalleMesResponseSchema = z
  .object({
    periodo: z.string().describe('Resolved period, format YYYY-MM.'),
    bucket: z
      .string()
      .describe(
        'Validated bucket name (echo, not raw input) — one of the 4-bucket allowlist (D-08).',
      ),
    total: z
      .string()
      .describe('BigInt-safe decimal string amount (never a JSON number).'),
    totalTransacciones: z.number().int().nonnegative(),
    totalCategorias: z
      .number()
      .int()
      .nonnegative()
      .describe(
        'Includes the synthetic Sin categoría group when present (D-09).',
      ),
    porcentajeBp: z
      .number()
      .int()
      .nullable()
      .describe(
        'Basis-point percentage, round-half-up. null when the bucket has no meta rule (SinCategoria) or the month has no income (D-05).',
      ),
    metaBp: z
      .number()
      .int()
      .nullable()
      .describe(
        "Bucket's 50/30/20 target from BANDAS_SEMAFORO; null when absent (D-05).",
      ),
    grupos: z
      .array(grupoDetalleMesSchema)
      .describe(
        'One entry per present category, es-CL alphabetical, "Sin categoría" last. [] for an empty bucket month (MBD-01).',
      ),
  })
  .meta({
    id: 'BucketDetalleMesResponse',
    description:
      'GET /api/buckets/:bucket/detalle — month×bucket detail grouped by category: header totals, % vs meta, and category groups with ALL their transactions (US-051).',
  });
