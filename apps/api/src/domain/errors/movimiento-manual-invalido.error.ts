/**
 * MovimientoManualInvalidoError — error de dominio.
 *
 * Se produce cuando los datos de un movimiento registrado manualmente
 * violan un invariante del negocio (US-058): fecha futura, descripción
 * vacía o demasiado larga, monto no entero positivo, desbordamiento de
 * precisión, o invariantes heredados de Transaccion.crear.
 *
 * El `code` identifica la causa exacta. El `message` es una CONSTANTE de
 * compilación: NO interpola ningún valor del request (ADR-013, scrub-safe).
 * Los códigos SIN_MONTOS, MONTO_NEGATIVO y CARGO_Y_ABONO se incluyen para
 * cubrir los resultados de TransaccionInvalidaError que se mapean en el
 * límite del VO; CARGO_Y_ABONO es estructuralmente inalcanzable en tiempo
 * de ejecución desde MovimientoManual.crear, pero se requiere para la
 * exhaustividad de TypeScript (D-09).
 */
export type MotivoMovimientoManualInvalido =
  | 'FECHA_FUTURA'
  | 'DESCRIPCION_VACIA'
  | 'DESCRIPCION_LARGA'
  | 'MONTO_INVALIDO'
  | 'MONTO_OVERFLOW'
  | 'SIN_MONTOS'
  | 'MONTO_NEGATIVO'
  | 'CARGO_Y_ABONO';

export class MovimientoManualInvalidoError extends Error {
  readonly code: MotivoMovimientoManualInvalido;

  constructor(code: MotivoMovimientoManualInvalido) {
    super('El movimiento manual no es válido; verifique los datos ingresados.');
    this.name = 'MovimientoManualInvalidoError';
    this.code = code;
  }
}
