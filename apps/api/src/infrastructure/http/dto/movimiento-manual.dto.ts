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
 * The `bucket` and `categoriaId` parameters come from the use case result — the
 * route already has them resolved (D-11 step 6) and passes them here so the
 * mapper stays a pure data-shape function.
 *
 * For Ingreso rows: bucket = "Ingreso", categoriaId = null (defaults below).
 * For Gasto rows:  bucket = the chosen BucketDeGasto enum value, categoriaId
 *                  provided by the caller.
 *
 * NO DB read-back, NO ICryptoService dependency (D-08).
 */
export function aRegistrarMovimientoManualResponseDto(
  vo: MovimientoManual,
  id: string,
  categoriaId: string | null = null,
  bucket: string = vo.tipo === 'Ingreso' ? 'Ingreso' : '',
): RegistrarMovimientoManualResponseDto {
  const tx = vo.transaccion;
  return {
    id,
    fecha: tx.fecha.toISOString(),
    descripcion: tx.descripcion,
    cargo: String(tx.cargo),
    abono: String(tx.abono),
    bucket,
    categoriaId,
    origen: 'Manual',
  };
}
