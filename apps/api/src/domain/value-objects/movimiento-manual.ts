import { Result } from '../../shared/result';
import {
  MovimientoManualInvalidoError,
  MotivoMovimientoManualInvalido,
} from '../errors/movimiento-manual-invalido.error';
import { Transaccion } from './transaccion';

/**
 * MovimientoManual — value object (US-058, D-01/D-02).
 *
 * Encapsula la validación de un movimiento registrado manualmente:
 *   - Convierte el `monto` (string) a BigInt con guarda de overflow (D-01-a).
 *   - Valida `descripcion` no vacía y ≤ 500 chars (D-01-c).
 *   - Valida `fecha ≤ hoy` en UTC (D-01-d / D-02).
 *   - Mapea `tipo` → `(cargo, abono)` y delega a `Transaccion.crear` para
 *     los invariantes XOR/no-negativo/no-cero (D-01-b/D-09).
 *   - Traduce todos los `TransaccionInvalidaError` al único error de surface
 *     `MovimientoManualInvalidoError` (union cerrada, D-09).
 *
 * Invariante de seguridad: el constructor es privado — la única forma de
 * obtener un MovimientoManual es `crear`.
 */
export class MovimientoManual {
  private readonly _tag = 'MovimientoManual' as const;

  private constructor(
    readonly transaccion: Transaccion,
    readonly tipo: 'Ingreso' | 'Gasto',
  ) {}

  esIngreso(): boolean {
    return this.tipo === 'Ingreso';
  }

  /**
   * Crea un MovimientoManual válido o retorna Result.fail con el código del problema.
   *
   * @param tipo   - 'Ingreso' | 'Gasto' (discriminant del union)
   * @param fecha  - Fecha del movimiento (ya parseada desde ISO YYYY-MM-DD en la capa HTTP)
   * @param descripcion - Texto descriptivo libre; max 500 chars
   * @param monto  - Importe como string decimal positivo entero (BigInt-safe)
   * @param clock  - Inyectable para tests; por defecto `() => new Date()`
   */
  static crear(props: {
    tipo: 'Ingreso' | 'Gasto';
    fecha: Date;
    descripcion: string;
    monto: string;
    clock?: () => Date;
  }): Result<MovimientoManual, MovimientoManualInvalidoError> {
    const { tipo, fecha, descripcion, monto } = props;
    const ahora = (props.clock ?? (() => new Date()))();

    // (a) Descripcion — validar antes del monto para detectar errores obvios primero
    const descripcionTrimmed = descripcion.trim();
    if (descripcionTrimmed.length === 0) {
      return Result.fail(
        new MovimientoManualInvalidoError('DESCRIPCION_VACIA'),
      );
    }
    if (descripcionTrimmed.length > 500) {
      return Result.fail(
        new MovimientoManualInvalidoError('DESCRIPCION_LARGA'),
      );
    }

    // (a) Decimal-string → BigInt conversion + overflow guard (D-01-a)
    // Rechazo estricto: solo enteros positivos como strings decimales.
    // Negative, float, non-numeric → MONTO_INVALIDO.
    // Magnitude > Number.MAX_SAFE_INTEGER → MONTO_OVERFLOW.
    if (!/^\d+$/.test(monto)) {
      // Rejects: negatives ("-5"), floats ("1.5"), letters, empty
      return Result.fail(new MovimientoManualInvalidoError('MONTO_INVALIDO'));
    }

    const montoNum = Number(monto);

    if (!Number.isFinite(montoNum)) {
      // Extremely large strings that Number() returns Infinity for
      return Result.fail(new MovimientoManualInvalidoError('MONTO_OVERFLOW'));
    }

    if (montoNum > Number.MAX_SAFE_INTEGER) {
      return Result.fail(new MovimientoManualInvalidoError('MONTO_OVERFLOW'));
    }

    const montoBigInt = BigInt(monto);

    // (c) Fecha ≤ hoy en fecha UTC (D-01-d / D-02)
    // Comparación por fecha calendario UTC para evitar el foot-gun de timezone del servidor.
    const fechaUtc = Date.UTC(
      fecha.getUTCFullYear(),
      fecha.getUTCMonth(),
      fecha.getUTCDate(),
    );
    const hoyUtc = Date.UTC(
      ahora.getUTCFullYear(),
      ahora.getUTCMonth(),
      ahora.getUTCDate(),
    );
    if (fechaUtc > hoyUtc) {
      return Result.fail(new MovimientoManualInvalidoError('FECHA_FUTURA'));
    }

    // (b) Mapeo tipo → (cargo, abono) y delegación a Transaccion.crear (D-01-b)
    const cargo = tipo === 'Gasto' ? montoBigInt : 0n;
    const abono = tipo === 'Ingreso' ? montoBigInt : 0n;

    const txResult = Transaccion.crear({
      fecha,
      descripcion: descripcionTrimmed,
      cargo,
      abono,
    });

    if (txResult.isFail()) {
      // Mapear todos los TransaccionInvalidaError al error de surface del VO (D-09)
      const mapa: Record<string, MotivoMovimientoManualInvalido> = {
        SIN_MONTOS: 'SIN_MONTOS',
        MONTO_NEGATIVO: 'MONTO_NEGATIVO',
        CARGO_Y_ABONO: 'CARGO_Y_ABONO', // estructuralmente inalcanzable (D-09)
      };
      const motivo = txResult.getError().motivo;
      return Result.fail(
        new MovimientoManualInvalidoError(mapa[motivo] ?? 'MONTO_INVALIDO'),
      );
    }

    return Result.ok(new MovimientoManual(txResult.getValue(), tipo));
  }
}
