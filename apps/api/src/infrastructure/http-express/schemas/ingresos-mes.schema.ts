import { z } from 'zod';

/**
 * Query contract for `GET /api/ingresos/mes` — mirrors
 * `bucketDetalleMesQuerySchema` (transport shape only, US-051 D-07 discipline):
 * `periodo` cualquier string opcional; el formato YYYY-MM sigue siendo regla de
 * dominio via `PeriodoMes` → `PeriodoInvalidoError` (MID-04), NUNCA se duplica
 * en el schema.
 */
export const ingresosMesQuerySchema = z.object({
  periodo: z
    .string()
    .optional()
    .describe(
      'Month period, format YYYY-MM (e.g. 2026-07). Absent defaults to the current month. Format is validated by the domain, not this schema.',
    ),
});

/**
 * Income transaction entry (MID-02): ONLY {id, fecha, descripcion, origen,
 * monto} — `.strict()` hard-rejects any extra key (a stray `tipoCuenta`/
 * `numeroCuenta` fails parse): MID-06 becomes a wire guarantee
 * (additionalProperties: false in the generated OpenAPI), not just a mapper
 * discipline. `origen` = bank NAME verbatim (CA-02, US-017 precedent) —
 * deliberately NOT inheriting US-051 MBD-08's no-banco gate (design §3).
 */
const transaccionIngresoMesSchema = z
  .object({
    id: z.string(),
    fecha: z.string().describe('ISO-8601 UTC timestamp.'),
    descripcion: z.string(),
    origen: z
      .string()
      .describe(
        "Bank name verbatim ('BCI', 'BancoEstado', ...) or 'Manual' fallback (MID-02 / CA-02).",
      ),
    monto: z
      .string()
      .describe('BigInt-safe decimal string amount (never a JSON number).'),
  })
  .strict();

/**
 * Response contract for `GET /api/ingresos/mes` (D-03/D-05): EXACTLY `{total,
 * conteo, transacciones}` — sin `meta`/`porcentaje`/`estado` (MID-03: los
 * ingresos no participan de 50/30/20 como gasto) y sin echo de `periodo`
 * (MID-01 autoritativo). `.strict()` top-level = additionalProperties: false;
 * el leaf `.strict()` es la garantía wire de MID-06. Sync guarantee: checked
 * against `aIngresosMesDto()` output — see `ingresos-mes.schema.spec.ts`.
 */
export const ingresosMesResponseSchema = z
  .object({
    total: z
      .string()
      .describe('BigInt-safe decimal string amount (never a JSON number).'),
    conteo: z.number().int().nonnegative(),
    transacciones: z
      .array(transaccionIngresoMesSchema)
      .describe('Complete list — never truncated or paged (MID-01).'),
  })
  .strict()
  .meta({
    id: 'IngresosMesResponse',
    description:
      'GET /api/ingresos/mes — monthly income list by origin (bank/Manual): header total, count, and ALL transactions (US-052).',
  });
