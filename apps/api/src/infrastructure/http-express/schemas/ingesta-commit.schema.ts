import { z } from 'zod';

/**
 * Request contract for `POST /api/ingestas/commit` (US-057 PR5).
 *
 * Multipart/form-data with:
 *   - `file`:  the bank statement to commit (.xlsx or .pdf), same validation
 *              rules as the one-shot upload (domain: ExtensionNoPermitidaError,
 *              BancoNoReconocidoError) — NEVER .safeParse()'d at the route;
 *              multer (`subirArchivoConEdits()`) handles the actual upload.
 *   - `edits`: optional JSON text field (≤256 KB, enforced by multer
 *              `limits.fieldSize`). Shape: Array<{rowIndex,categoriaId}>.
 *              Absent/empty ⇒ empty overlay (pure auto-classify commit).
 *              This schema documents the shape for the OpenAPI doc only.
 *
 * D-02: `edits` uses its own multer instance (`subirArchivoConEdits`), never
 * the shared `subirArchivo()` — the 256 KB fieldSize cap is commit-specific.
 */
export const commitIngestaRequestSchema = z.object({
  file: z
    .file()
    .describe(
      'Bank statement file (.xlsx or .pdf). Extension/bank-format validation is a domain rule ' +
        '(ExtensionNoPermitidaError / BancoNoReconocidoError), not this schema.',
    ),
  edits: z
    .string()
    .optional()
    .describe(
      'JSON text field carrying the edit overlay: ' +
        'Array<{ rowIndex: number, categoriaId: string | null }>. ' +
        'Absent or empty ⇒ empty overlay (pure auto-classify commit). ' +
        'Max 256 KB, enforced by multer limits.fieldSize (D-02).',
    ),
});

/**
 * CommitTransaccionResponseDto mirror — money as BigInt-safe decimal strings,
 * bucket as the serialized Bucket enum value (D-09/bucket.ts). Mirrors
 * `CommitTransaccionResponseDto` in `commit-ingesta.dto.ts`.
 *
 * `bucket` is ALWAYS present for a commit row — commit resolves classification
 * pre-persist; `bucketId: null` is a one-shot-only pending state (D-11).
 * `categoriaId` is `string | null` (null = Ingreso or DES-CLASIFICAR, D-11).
 */
const commitTransaccionResponseSchema = z.object({
  fecha: z.string().describe('ISO-8601 UTC timestamp.'),
  descripcion: z.string(),
  cargo: z
    .string()
    .describe('BigInt-safe decimal string amount (never a JSON number).'),
  abono: z
    .string()
    .describe('BigInt-safe decimal string amount (never a JSON number).'),
  bucket: z
    .string()
    .describe(
      'Serialized Bucket enum value (Necesidades|Deseos|Ahorro|Ingreso|SinCategoria). ' +
        'Always present for commit rows — classification is resolved pre-persist (D-11).',
    ),
  categoriaId: z
    .string()
    .nullable()
    .describe(
      'Final category assigned, or null for Ingreso rows and DES-CLASIFICAR entries (D-11).',
    ),
});

/**
 * Response contract for `POST /api/ingestas/commit` (US-057, CMT-05).
 *
 * Mirrors `CommitIngestaResponseDto` (`infrastructure/http/dto/commit-ingesta.dto.ts`).
 * Distinct from `IngestaUploadResponse` — commit rows carry `bucket` + `categoriaId`
 * (D-13: independent mapper, does NOT delegate to `aIngestaResponseDto`).
 *
 * The `aCommitIngestaResponseDto()` mapper is the sync guarantee this schema
 * is checked against — see `ingesta-commit.schema.spec.ts`.
 */
export const commitIngestaResponseSchema = z
  .object({
    ingestaId: z.string(),
    totalTransacciones: z
      .number()
      .int()
      .describe(
        'Rows actually persisted (excludes duplicates omitted at commit). Not money — plain JSON number.',
      ),
    duplicadosOmitidos: z
      .number()
      .int()
      .describe(
        'New duplicates found at commit-time dedup — reported, never aborts (D-13/CA-03).',
      ),
    transacciones: z.array(commitTransaccionResponseSchema),
  })
  .strict()
  .meta({
    id: 'CommitIngestaResponse',
    description:
      'POST /api/ingestas/commit — commit result with per-row bucket + categoriaId (US-057, CMT-05).',
  });
