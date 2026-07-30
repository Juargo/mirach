import { Result } from '../../shared/result';
import { TransaccionInvalidaError } from '../errors/transaccion-invalida.error';

/**
 * Transaccion — value object del esquema canónico unificado para todos los
 * bancos (US-007), con su invariante protegido en un único lugar.
 *
 *   fecha        → Date en UTC, normalizada desde DD/MM/YYYY, YYYY-MM-DD o DD-MM-YYYY.
 *   descripcion  → texto descriptivo tal cual aparece en el archivo original.
 *   cargo        → monto debitado en pesos exactos (BigInt), ≥ 0. 0n si es abono.
 *   abono        → monto acreditado en pesos exactos (BigInt), ≥ 0. 0n si es cargo.
 *
 * El dinero es `BigInt` en TODO el dominio (representación exacta única): no hay
 * `number` intermedio, así que no existe riesgo de overflow 2^53 ni conversiones
 * de ida y vuelta. La persistencia usa el mismo BigInt (mapeo 1:1).
 *
 * Invariante (CA-06, CA-07, CA-08) — garantizado por `crear`, imposible de violar:
 *   - cargo y abono son ≥ 0 (celdas vacías → 0n; negativos de BancoEstado ya
 *     vienen en valor absoluto desde el normalizer).
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
    readonly cargo: bigint,
    readonly abono: bigint,
  ) {}

  static crear(props: {
    fecha: Date;
    descripcion: string;
    cargo: bigint;
    abono: bigint;
  }): Result<Transaccion, TransaccionInvalidaError> {
    const { fecha, descripcion, cargo, abono } = props;

    if (cargo < 0n || abono < 0n) {
      return Result.fail(new TransaccionInvalidaError('MONTO_NEGATIVO'));
    }
    if (cargo === 0n && abono === 0n) {
      return Result.fail(new TransaccionInvalidaError('SIN_MONTOS'));
    }
    if (cargo > 0n && abono > 0n) {
      return Result.fail(new TransaccionInvalidaError('CARGO_Y_ABONO'));
    }

    return Result.ok(new Transaccion(fecha, descripcion, cargo, abono));
  }

  /**
   * Regla de negocio "es ingreso": abono > 0 y cargo = 0 (RF-VIS-001).
   * Estático para que el read model de categorización (bigint, post-persistencia,
   * sin fecha) la evalúe sin reconstruir una instancia completa del VO. La regla
   * vive en un único lugar; el método de instancia solo delega.
   */
  static esIngreso(cargo: bigint, abono: bigint): boolean {
    return abono > 0n && cargo === 0n;
  }

  esIngreso(): boolean {
    return Transaccion.esIngreso(this.cargo, this.abono);
  }
}
