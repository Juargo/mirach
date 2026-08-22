import type { MovimientoManual } from '../../../domain/value-objects/movimiento-manual';

// ---------------------------------------------------------------------------
// RegistrarMovimientoManualResponseDto (US-058, D-12, T-14)
//
// HTTP response shape for POST /api/movimientos (201 Created).
// Amounts are BigInt-safe strings (never JSON numbers).
// `descripcion` is sourced from vo.transaccion.descripcion — the plaintext
// already in memory. NO DB read-back, NO decrypt round-trip (D-08).
// ---------------------------------------------------------------------------

/**
 * RegistrarMovimientoManualResponseDto — HTTP contract for POST /api/movimientos 201.
 *
 * Field notes:
 * - `cargo`/`abono`: BigInt-safe decimal strings (D-12, money-DTO rule).
 * - `bucket`: Bucket enum value as wire string (matches GET /api/movimientos).
 * - `categoriaId`: null for Ingreso rows; string for Gasto rows.
 * - `origen`: always "Manual" for this endpoint (C-a, D-13).
 * - `descripcion`: plaintext from the in-memory VO — not re-fetched from DB.
 */
export interface RegistrarMovimientoManualResponseDto {
  id: string;
  fecha: string; // ISO-8601 UTC
  descripcion: string; // plaintext (vo.transaccion.descripcion)
  cargo: string; // BigInt-safe; "0" for Ingreso
  abono: string; // BigInt-safe; "0" for Gasto
  bucket: string; // Bucket enum value (Ingreso | Necesidades | Deseos | Ahorro)
  categoriaId: string | null; // null for Ingreso
  origen: 'Manual'; // C-a constant — manual rows always carry this
}

/**
 * aRegistrarMovimientoManualResponseDto — maps a MovimientoManual VO + id to
 * the HTTP response DTO.
 *
 * For Ingreso rows: `categoriaId` defaults to null and `bucket` defaults to
 * "Ingreso" by construction (D-10). For Gasto rows both MUST be supplied
 * explicitly — the runtime guard throws if `bucket` is omitted or empty on a
 * Gasto VO, making the invalid state impossible at runtime.
 *
 * NO DB read-back, NO ICryptoService dependency (D-08).
 */
export function aRegistrarMovimientoManualResponseDto(
  vo: MovimientoManual,
  id: string,
  categoriaId: string | null = null,
  bucket?: string,
): RegistrarMovimientoManualResponseDto {
  const resolvedBucket =
    bucket !== undefined && bucket !== ''
      ? bucket
      : vo.tipo === 'Ingreso'
        ? 'Ingreso'
        : undefined;

  if (resolvedBucket === undefined) {
    // Gasto callers must supply a non-empty bucket explicitly.
    // An empty-string or missing bucket on a Gasto VO is a programmer error —
    // the route always resolves bucket before calling this mapper (D-12).
    throw new Error(
      'aRegistrarMovimientoManualResponseDto: bucket is required for Gasto rows',
    );
  }

  const tx = vo.transaccion;
  return {
    id,
    fecha: tx.fecha.toISOString(),
    descripcion: tx.descripcion,
    cargo: String(tx.cargo),
    abono: String(tx.abono),
    bucket: resolvedBucket,
    categoriaId,
    origen: 'Manual',
  };
}
