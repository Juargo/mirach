import { Result } from '../../shared/result';
import { TransaccionInvalidaError } from '../errors/transaccion-invalida.error';

/**
 * Transaccion — value object del esquema canónico unificado para todos los
 * bancos (US-007), con su invariante protegido en un único lugar.
 *
 *   fecha        → Date en UTC, normalizada desde DD/MM/YYYY, YYYY-MM-DD o DD-MM-YYYY.
 *   descripcion  → texto descriptivo tal cual aparece en el archivo original.
 *   cargo        → monto debitado, entero ≥ 0. 0 si la fila es un abono.
 *   abono        → monto acreditado, entero ≥ 0. 0 si la fila es un cargo.
 *
 * Invariante (CA-06, CA-07, CA-08) — garantizado por `crear`, imposible de violar:
 *   - cargo y abono son enteros ≥ 0 (celdas vacías → 0; negativos de BancoEstado
 *     ya vienen en valor absoluto desde el normalizer).
 *   - una línea es débito XOR crédito: exactamente uno de {cargo, abono} es > 0.
 *
 * El constructor es privado: la ÚNICA forma de obtener una Transaccion es
 * `crear`, de modo que ninguna capa externa puede construir una inválida.
 */
export class Transaccion {
  // Brand nominal: fuerza a que la ÚNICA forma de obtener una Transaccion sea
  // `crear`. Sin este miembro privado, TypeScript (structural) aceptaría un
  // literal `{ fecha, descripcion, cargo, abono }` como Transaccion y el
  // invariante quedaría sin proteger.
  private readonly _tag = 'Transaccion' as const;

  private constructor(
    readonly fecha: Date,
    readonly descripcion: string,
    readonly cargo: number,
    readonly abono: number,
  ) {}

  static crear(props: {
    fecha: Date;
    descripcion: string;
    cargo: number;
    abono: number;
  }): Result<Transaccion, TransaccionInvalidaError> {
    const { fecha, descripcion, cargo, abono } = props;

    if (!Number.isInteger(cargo) || !Number.isInteger(abono)) {
      return Result.fail(new TransaccionInvalidaError('MONTO_NO_ENTERO'));
    }
    if (cargo < 0 || abono < 0) {
      return Result.fail(new TransaccionInvalidaError('MONTO_NEGATIVO'));
    }
    if (cargo === 0 && abono === 0) {
      return Result.fail(new TransaccionInvalidaError('SIN_MONTOS'));
    }
    if (cargo > 0 && abono > 0) {
      return Result.fail(new TransaccionInvalidaError('CARGO_Y_ABONO'));
    }

    return Result.ok(new Transaccion(fecha, descripcion, cargo, abono));
  }
}
