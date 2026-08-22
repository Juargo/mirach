import { z } from 'zod';

// ---------------------------------------------------------------------------
// movimiento-manual.schema.ts (US-058, D-12, T-15)
//
// Transport-shape contract for POST /api/movimientos.
//
// LAYER-HONESTY GATE (design D-12): this schema validates SHAPE ONLY.
// Business rules that live in the domain MUST NOT be duplicated here:
//   - `fecha ≤ today` stays in MovimientoManual.crear (D-01-d/D-02)
//   - monto positivity and overflow stays in MovimientoManual.crear (D-01-a)
//   - categoriaId catalog membership stays in the use case (D-11 step 3)
//
// Q3 resolution (design §2): Ingreso is .strict() — a request body that
// carries stray bucket/categoriaId signals a CLIENT BUG (wrong tipo) and
// must be rejected 400, not silently ignored. Consistent with the repo's
// fail-closed boundary doctrine. Gasto requires both bucket and categoriaId.
// ---------------------------------------------------------------------------

/**
 * Discriminant values for the `tipo` field.
 */
const tipoIngreso = 'Ingreso' as const;
const tipoGasto = 'Gasto' as const;

/**
 * Valid Gasto buckets at the transport layer.
 *
 * Ingreso and SinCategoria are NOT valid caller-supplied Gasto buckets:
 * - Ingreso is assigned by construction (D-10).
 * - SinCategoria is a system fallback sentinel, never a request value.
 */
const GASTO_BUCKETS = ['Necesidades', 'Deseos', 'Ahorro'] as const;

/**
 * Common fields shared by both Ingreso and Gasto variants.
 *
 * `monto` — z.string(): BigInt-safe (JSON number → 400). Business-rule
 * validation (positive integer, no float, overflow) stays in the domain.
 *
 * `fecha` — shape-only regex `YYYY-MM-DD`. The `fecha ≤ today` rule is a
 * domain invariant (MovimientoManual.crear, D-01-d) and MUST NOT live here.
 */
const baseFields = {
  fecha: z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}$/,
      'fecha must be in YYYY-MM-DD format (e.g. 2026-08-10)',
    ),
  descripcion: z.string(),
  monto: z
    .string()
    .describe(
      'BigInt-safe decimal string (never a JSON number). ' +
        'Domain enforces positivity, no float, and overflow guard.',
    ),
};

/**
 * Ingreso variant — `.strict()` rejects stray bucket or categoriaId fields.
 *
 * A caller sending bucket/categoriaId on an Ingreso is either confused about
 * the tipo or sending the wrong request; fail-closed (Q3 resolution, design §2).
 */
const ingresoSchema = z
  .object({
    tipo: z.literal(tipoIngreso),
    ...baseFields,
  })
  .strict();

/**
 * Gasto variant — requires `bucket` ∈ {Necesidades, Deseos, Ahorro} and
 * a non-empty `categoriaId` string. Both are REQUIRED: missing either
 * produces a 400 before the use case runs.
 */
const gastoSchema = z.object({
  tipo: z.literal(tipoGasto),
  ...baseFields,
  bucket: z.enum(GASTO_BUCKETS),
  categoriaId: z.string(),
});

/**
 * registrarMovimientoManualSchema — discriminated union on `tipo`.
 *
 * Parsed result shape:
 *   - Ingreso: { tipo: 'Ingreso', fecha, descripcion, monto }
 *   - Gasto:   { tipo: 'Gasto', fecha, descripcion, monto, bucket, categoriaId }
 */
export const registrarMovimientoManualSchema = z.discriminatedUnion('tipo', [
  ingresoSchema,
  gastoSchema,
]);

/**
 * ParsedRegistrarMovimientoManualBody — inferred type of a successfully
 * parsed request body. Used by the route handler to build the use case command.
 */
export type ParsedRegistrarMovimientoManualBody = z.infer<
  typeof registrarMovimientoManualSchema
>;
