import { z } from 'zod';
import { resumenResponseSchema } from './resumen.schema';

/**
 * Query contract for `GET /api/resumen/anual` (openapi-contract-express
 * rollout, Phase 10).
 *
 * TRANSPORT SHAPE ONLY (layer-honesty gate, mirrors `resumen.schema.ts`):
 * `anio` is an optional string. The integer-range rule (2000-2100) is a
 * DOMAIN rule (`AnioInvalidoError`, `CalcularResumenAnualUseCase`) and MUST
 * NOT be duplicated here — a malformed-but-string `anio` still reaches the
 * use case and gets the existing scrubbed 400.
 */
export const resumenAnualQuerySchema = z.object({
  anio: z
    .string()
    .optional()
    .describe(
      'Year, e.g. 2026. Absent defaults to the current year. Range/format is validated by the domain, not this schema.',
    ),
});

/**
 * Response contract for `GET /api/resumen/anual` (mirrors `ResumenAnualDto`,
 * `infrastructure/http/dto/resumen-anual.dto.ts`). Reuses `resumenResponseSchema`
 * for each of the 12 months (DRY — same mirroring the mapper does via
 * `aResumenMesDto`).
 */
export const resumenAnualResponseSchema = z
  .object({
    anio: z.number().int(),
    meses: z
      .array(resumenResponseSchema)
      .describe('Always 12 entries, Enero→Diciembre.'),
  })
  .meta({
    id: 'ResumenAnualResponse',
    description: 'GET /api/resumen/anual — 50/30/20 annual breakdown (US-030).',
  });
