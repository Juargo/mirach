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
 * `PreviewTransaccionDto` mirror — money as BigInt-safe decimal strings, same
 * contract as the upload endpoint's transaction rows.
 */
const previewTransaccionSchema = z.object({
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
 * Response contract for `POST /api/ingestas/preview` (mirrors
 * `PreviewIngestaDto`, `infrastructure/http/dto/preview-ingesta.dto.ts`).
 * The `aPreviewIngestaDto()` mapper is the sync guarantee this schema is
 * checked against — see `ingesta-preview.schema.spec.ts`. `muestra` is
 * capped by the use case (`PREVIEW_SAMPLE_MAX`) — this schema documents the
 * shape only, not the cap.
 */
export const previewIngestaResponseSchema = z
  .object({
    banco: z.string(),
    tipoCuenta: z.string(),
    numeroCuenta: z.string(),
    estructura: z.object({
      totalFilasDatos: z
        .number()
        .int()
        .describe('Row count PRE-dedupe, not money — plain JSON number.'),
    }),
    muestra: z.array(previewTransaccionSchema),
  })
  .meta({
    id: 'PreviewIngestaResponse',
    description:
      'POST /api/ingestas/preview — dry-run sample of a would-be upload (US-003).',
  });
