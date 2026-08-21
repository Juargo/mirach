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
  totalFilasDatos: z
    .number()
    .int()
    .describe('Row count PRE-dedupe, not money — plain JSON number.'),
  duplicados: z.number().int(),
  nuevas: z.number().int(),
});

/**
 * Response contract for `POST /api/ingestas/preview` (mirrors
 * `PreviewIngestaDto`, `infrastructure/http/dto/preview-ingesta.dto.ts`).
 * The `aPreviewIngestaDto()` mapper is the sync guarantee this schema is
 * checked against — see `ingesta-preview.schema.spec.ts`.
 *
 * US-057 PR2: shape changed from { banco, estructura, muestra } to
 * { banco, resumen, filas } with per-row dedup and classification suggestion.
 */
export const previewIngestaResponseSchema = z
  .object({
    banco: z.string(),
    tipoCuenta: z.string(),
    numeroCuenta: z.string(),
    resumen: previewResumenSchema,
    filas: z.array(previewFilaSchema),
  })
  .meta({
    id: 'PreviewIngestaResponse',
    description:
      'POST /api/ingestas/preview — dry-run preview with per-row dedup and classification (US-057).',
  });
