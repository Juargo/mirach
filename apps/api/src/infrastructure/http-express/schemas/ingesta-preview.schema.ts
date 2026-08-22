import { z } from 'zod';

/**
 * Request contract for `POST /api/ingestas/preview` (openapi-contract-express
 * rollout, Phase 10.2c). Multipart/form-data, one `file` field — same shape
 * as `ingesta-upload.schema.ts`'s request, kept as its own small schema
 * (D7-style: trivial duplication is preferable to coupling two independent
 * features). NEVER `.safeParse()`'d at the route — multer handles the file,
 * this only documents the shape for the OpenAPI doc.
 */
export const previewIngestaRequestSchema = z.object({
  file: z
    .file()
    .describe(
      'Bank statement file (.xlsx or .pdf). Extension/bank-format validation is a domain rule ' +
        '(ExtensionNoPermitidaError / BancoNoReconocidoError), not this schema.',
    ),
});

/**
 * PreviewTransaccionDto mirror — money as BigInt-safe decimal strings (US-057 PR2).
 * Includes per-row dedup status and classification suggestion (D-09).
 * Full formalisation in openapi.json is PR4/5.
 */
const previewFilaSchema = z.object({
  rowIndex: z.number().int().nonnegative(),
  fecha: z.string().describe('ISO-8601 UTC timestamp.'),
  descripcion: z.string(),
  cargo: z
    .string()
    .describe('BigInt-safe decimal string amount (never a JSON number).'),
  abono: z
    .string()
    .describe('BigInt-safe decimal string amount (never a JSON number).'),
  esDuplicado: z.boolean(),
  sugerido: z
    .object({
      bucket: z.string(),
      categoriaId: z.string().nullable(),
    })
    .nullable(),
});

/**
 * Resumen agregado del preview (US-057 PR2).
 */
const previewResumenSchema = z.object({
  totalFilas: z
    .number()
    .int()
    .describe('Row count PRE-dedupe, not money — plain JSON number.'),
  duplicadosDetectados: z.number().int(),
  nuevas: z.number().int(),
});

/**
 * LEGACY row shape — the pre-US-057 `muestra[]` element. Only the four original
 * fields. @deprecated compat shim, removed by US-061.
 */
const previewMuestraLegacySchema = z.object({
  fecha: z.string().describe('ISO-8601 UTC timestamp.'),
  descripcion: z.string(),
  cargo: z
    .string()
    .describe('BigInt-safe decimal string amount (never a JSON number).'),
  abono: z
    .string()
    .describe('BigInt-safe decimal string amount (never a JSON number).'),
});

/**
 * LEGACY aggregate — the pre-US-057 `estructura` object. @deprecated compat
 * shim, removed by US-061.
 */
const previewEstructuraLegacySchema = z.object({
  totalFilasDatos: z
    .number()
    .int()
    .describe(
      'DEPRECATED (US-061): mirror of resumen.totalFilas. Kept for shipped clients.',
    ),
});

/**
 * Response contract for `POST /api/ingestas/preview` (mirrors
 * `PreviewIngestaDto`, `infrastructure/http/dto/preview-ingesta.dto.ts`).
 * The `aPreviewIngestaDto()` mapper is the sync guarantee this schema is
 * checked against — see `ingesta-preview.schema.spec.ts`.
 *
 * BACKWARD-COMPATIBLE (product decision 2026-08-21): carries BOTH shapes.
 * - CANONICAL (US-057): `resumen` + `filas` — marked `.optional()` at the wire
 *   level ONLY so the generated api-client type stays assignable from legacy
 *   client literals (deployed mobile APK, pre-migration web/mobile) that build
 *   a preview object with just the legacy fields. The server ALWAYS emits both
 *   (see the mapper + sync-guarantee spec).
 * - LEGACY (@deprecated, removed by US-061): `estructura` + `muestra` — required
 *   so shipped consumers that read them keep typechecking.
 */
export const previewIngestaResponseSchema = z
  .object({
    banco: z.string(),
    tipoCuenta: z.string(),
    numeroCuenta: z.string(),
    resumen: previewResumenSchema.optional(),
    filas: z.array(previewFilaSchema).optional(),
    estructura: previewEstructuraLegacySchema.describe(
      'DEPRECATED (US-061): legacy aggregate. Use resumen.',
    ),
    muestra: z
      .array(previewMuestraLegacySchema)
      .describe(
        'DEPRECATED (US-061): legacy first-50-rows sample in the old 4-field shape. Use filas.',
      ),
  })
  .meta({
    id: 'PreviewIngestaResponse',
    description:
      'POST /api/ingestas/preview — dry-run preview. CANONICAL: resumen + filas ' +
      '(full set, per-row dedup and classification, US-057). DEPRECATED (removed by ' +
      'US-061): estructura + muestra (first 50 rows, old shape) kept for shipped clients.',
  });
