import { Result } from '../../shared/result';
import { VersionAppInvalidaError } from '../errors/version-app-invalida.error';

/**
 * VersionApp — value object de dominio (ADR-005 §4.5).
 *
 * Versión instalada o mínima de una app nativa, en formato MAJOR.MINOR.PATCH.
 * La comparación es NUMÉRICA por componente — `1.10.0` es mayor que `1.9.0`,
 * cosa que una comparación de strings invertiría.
 *
 * Cada componente admite hasta 6 dígitos: el valor puede venir de un header
 * arbitrario, así que el largo queda acotado y nunca excede un entero seguro.
 *
 * El value object es inmutable — no hay setters.
 */
export class VersionApp {
  private static readonly FORMATO = /^(\d{1,6})\.(\d{1,6})\.(\d{1,6})$/;

  private constructor(
    readonly mayor: number,
    readonly menor: number,
    readonly parche: number,
  ) {}

  static crear(raw: string): Result<VersionApp, VersionAppInvalidaError> {
    const partes = VersionApp.FORMATO.exec(raw);
    if (partes === null) {
      return Result.fail(new VersionAppInvalidaError());
    }
    return Result.ok(
      new VersionApp(Number(partes[1]), Number(partes[2]), Number(partes[3])),
    );
  }

  /** `true` cuando esta versión es estrictamente anterior a `otra`. */
  esMenorQue(otra: VersionApp): boolean {
    if (this.mayor !== otra.mayor) return this.mayor < otra.mayor;
    if (this.menor !== otra.menor) return this.menor < otra.menor;
    return this.parche < otra.parche;
  }

  toString(): string {
    return `${this.mayor}.${this.menor}.${this.parche}`;
  }
}
