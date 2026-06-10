/**
 * Transaccion — esquema canónico unificado para todos los bancos (US-007).
 *
 *   fecha        → Date en UTC, normalizada desde DD/MM/YYYY, YYYY-MM-DD o DD-MM-YYYY.
 *   descripcion  → texto descriptivo tal cual aparece en el archivo original.
 *   cargo        → monto debitado, entero positivo. 0 si la fila es un abono.
 *   abono        → monto acreditado, entero positivo. 0 si la fila es un cargo.
 *
 * Reglas (CA-06, CA-07, CA-08):
 *   - Celdas vacías o nulas se normalizan a 0.
 *   - Separadores de miles (`.` o `,`) y decimales se descartan al convertir a entero.
 *   - Cargos expresados como negativos (BancoEstado) se almacenan en valor absoluto.
 */
export interface Transaccion {
  readonly fecha: Date;
  readonly descripcion: string;
  readonly cargo: number;
  readonly abono: number;
}
