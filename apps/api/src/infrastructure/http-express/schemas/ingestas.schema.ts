import { z } from 'zod';

/**
 * `GET /api/ingestas` (openapi-contract-express rollout, Phase 10) has no
 * query or path params — a plain per-user list, so only a response schema is
 * needed.
 *
 * Mirrors `IngestaListItemDto`, `infrastructure/http/dto/ingesta-list.dto.ts`.
 * `estado` is a wire string-literal union (NOT the Prisma enum, ADR-005 —
 * the contract never leaks a persistence type across the boundary).
 * `totalTransacciones` is a ROW COUNT, plain `z.number().int()` — contrast
 * with the BigInt-safe-string treatment used for money fields elsewhere.
 */
const ingestaListItemSchema = z.object({
  id: z.string(),
  banco: z
    .string()
    .nullable()
    .describe('null when an early FALLIDA ingesta never resolved a bank.'),
  nombreArchivo: z.string(),
  estado: z.enum(['PROCESADA', 'FALLIDA']),
  motivoFallo: z.string().nullable(),
  fecha: z.string().describe('ISO-8601 UTC timestamp.'),
  totalTransacciones: z
    .number()
    .int()
    .describe('Row count, not money — plain JSON number.'),
});

/**
 * Response contract for `GET /api/ingestas`. The `aIngestaListItemDto()`
 * mapper is the sync guarantee this schema is checked against — see
 * `ingestas.schema.spec.ts`.
 */
export const ingestasResponseSchema = z
  .object({
    ingestas: z.array(ingestaListItemSchema),
  })
  .meta({
    id: 'IngestasListResponse',
    description: 'GET /api/ingestas — per-user ingesta list (US-004/US-018).',
  });
