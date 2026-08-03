import { z } from 'zod';

/**
 * Query contract for `GET /api/movimientos` (openapi-contract-express
 * rollout, Phase 10).
 *
 * TRANSPORT SHAPE ONLY (layer-honesty gate, mirrors `resumen.schema.ts`):
 * `periodo` is an optional string. The YYYY-MM format rule is a DOMAIN rule
 * (`PeriodoMes` VO → `PeriodoInvalidoError`) and MUST NOT be duplicated here.
 */
export const movimientosQuerySchema = z.object({
  periodo: z
    .string()
    .optional()
    .describe(
      'Month period, format YYYY-MM (e.g. 2026-07). Absent defaults to the current month. Format is validated by the domain, not this schema.',
    ),
});

/**
 * `categoria` — mirrors the shared `{ id, nombre } | null` shape used across
 * movimientos/buckets DTOs (US-013 CATAPI-05).
 */
const categoriaSchema = z
  .object({
    id: z.string(),
    nombre: z.string(),
  })
  .nullable()
  .describe('Folded category, or null for Ingreso/SinCategoria rows.');

const movimientoItemSchema = z.object({
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
  bucket: z.string().describe('Bucket name (Bucket domain enum value).'),
  categoria: categoriaSchema,
});

/**
 * Response contract for `GET /api/movimientos` (mirrors `MovimientosMesDto`,
 * `infrastructure/http/dto/movimiento-mes.dto.ts`). The `aMovimientosMesDto()`
 * mapper is the sync guarantee this schema is checked against — see
 * `movimientos.schema.spec.ts`.
 */
export const movimientosResponseSchema = z
  .object({
    periodo: z.string().describe('Resolved period, format YYYY-MM.'),
    totalTransacciones: z.number().int(),
    transacciones: z.array(movimientoItemSchema),
  })
  .meta({
    id: 'MovimientosMesResponse',
    description: 'GET /api/movimientos — monthly transaction list (US-014).',
  });
