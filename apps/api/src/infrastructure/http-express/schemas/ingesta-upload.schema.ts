import { z } from 'zod';

/**
 * Request contract for `POST /api/ingestas` (openapi-contract-express
 * rollout, Phase 10.2c). Multipart/form-data, one `file` field — multer
 * (`subirArchivo()`, `routes/ingesta.routes.ts`) parses the actual upload;
 * this schema documents the shape for the OpenAPI doc only, it is NEVER
 * `.safeParse()`'d at the route (there is no JSON body to validate).
 *
 * `z.file()` (Zod 4 native) emits valid OpenAPI 3.1 JSON Schema
 * (`contentEncoding: 'binary'`, `format: 'binary'`) — the 3.1-correct
 * replacement for the OpenAPI-3.0-only `format: 'binary'` string shortcut.
 */
export const ingestaUploadRequestSchema = z.object({
  file: z
    .file()
    .describe(
      'Bank statement file (.xlsx or .pdf). Extension/bank-format validation is a domain rule ' +
        '(ExtensionNoPermitidaError / BancoNoReconocidoError), not this schema.',
    ),
});

/**
 * `TransaccionResponseDto` mirror — money as BigInt-safe decimal strings.
 */
const transaccionResponseSchema = z.object({
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
 * Response contract for `POST /api/ingestas` (mirrors `IngestaResponseDto`,
 * `infrastructure/http/dto/ingesta-response.dto.ts`). The
 * `aIngestaResponseDto()` mapper is the sync guarantee this schema is
 * checked against — see `ingesta-upload.schema.spec.ts`.
 */
export const ingestaUploadResponseSchema = z
  .object({
    ingestaId: z.string(),
    banco: z.string(),
    tipoCuenta: z.string(),
    numeroCuenta: z.string(),
    archivo: z.object({
      nombre: z.string(),
      extension: z.string(),
      tamanoBytes: z.number().int(),
    }),
    totalTransacciones: z
      .number()
      .int()
      .describe('Row count, not money — plain JSON number.'),
    duplicadosOmitidos: z
      .number()
      .int()
      .describe('Count of rows skipped as duplicates. Never omitted (CA-04).'),
    transacciones: z.array(transaccionResponseSchema),
  })
  .meta({
    id: 'IngestaUploadResponse',
    description:
      'POST /api/ingestas — successful upload result (US-004/US-005/US-011).',
  });
