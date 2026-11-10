import { z } from 'zod';

/**
 * Request contract for `POST /api/ingestas/preview` (openapi-contract-express
 * rollout, Phase 10.2c). Multipart/form-data, one `file` field. NEVER `.safeParse()`'d at the route — multer handles the file,
 * this only documents the shape for the OpenAPI doc.
 */
export const previewIngestaRequestSchema = z.object({
  file: z
    .file()
    .describe(
      'Bank statement file (.xlsx or .pdf). Extension/bank-format validation is a domain rule ' +
        '(ExtensionNoPermitidaError / BancoNoReconocidoError), not this schema.',
    ),
  password: z
    .string()
    .optional()
    .describe(
      'Optional password to unlock an encrypted PDF statement (design.md D-08). ' +
        'Absent or empty ⇒ file is treated as unprotected (byte-identical to pre-change behavior).',
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

const montoDecimalSchema = z
  .string()
  .describe('BigInt-safe decimal string amount (never a JSON number).');

const previewClasificacionCategoriaSchema = z.object({
  categoriaId: z
    .string()
    .nullable()
    .describe(
      'Null only for a spend row without a category (not expected today).',
    ),
  nombre: z.string(),
  cantidad: z.number().int().nonnegative(),
  total: montoDecimalSchema.describe(
    'Sum of `cargo` of the rows in this category (BigInt-safe decimal string).',
  ),
  filas: z
    .array(z.number().int().nonnegative())
    .describe('`rowIndex` of each row in this category, ascending.'),
});

const previewClasificacionBucketSchema = z.object({
  bucket: z
    .string()
    .describe(
      'Necesidades, Deseos or Ahorro; the product calls Deseos «Gustos».',
    ),
  cantidad: z.number().int().nonnegative(),
  total: montoDecimalSchema,
  categorias: z
    .array(previewClasificacionCategoriaSchema)
    .describe('Sorted by total descending, then by name.'),
});

/**
 * Classification summary of the preview (screen 04): server-computed grouping
 * bucket → category of the NEW rows, with counts and money totals, so clients
 * render an accordion without summing money. Duplicates are excluded.
 */
const previewClasificacionSchema = z
  .object({
    ingresos: z
      .object({
        cantidad: z.number().int().nonnegative(),
        total: montoDecimalSchema.describe(
          'Sum of `abono` of the income rows.',
        ),
      })
      .describe('Income rows (abono > 0 and cargo == 0), outside the buckets.'),
    buckets: z
      .array(previewClasificacionBucketSchema)
      .describe(
        'Only buckets with rows, in the fixed order Necesidades, Deseos, Ahorro.',
      ),
    desconocidos: z
      .number()
      .int()
      .nonnegative()
      .describe(
        "Spend rows that fell into the account's default «Desconocido» category (CLA-13).",
      ),
  })
  .describe(
    'How the new rows were auto-classified (bucket → category → rowIndex), with server-side totals.',
  );

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
  // Optional on the wire (the server always emits it) so a client generated from this
  // contract keeps decoding a preview from a server that predates the field.
  clasificacion: previewClasificacionSchema.optional(),
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
