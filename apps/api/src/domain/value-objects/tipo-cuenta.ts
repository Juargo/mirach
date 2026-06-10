/**
 * TipoCuenta — value object de dominio.
 *
 * Representa el tipo de cuenta bancaria del archivo importado.
 */
export enum TipoCuentaConocido {
  CuentaCorriente = 'Cuenta Corriente',
  CuentaRut = 'CuentaRUT',
  CuentaVista = 'Cuenta Vista',
}

export class TipoCuenta {
  private constructor(private readonly _valor: TipoCuentaConocido) {}

  static de(valor: TipoCuentaConocido): TipoCuenta {
    return new TipoCuenta(valor);
  }

  get valor(): TipoCuentaConocido {
    return this._valor;
  }

  equals(other: TipoCuenta): boolean {
    return this._valor === other._valor;
  }

  toString(): string {
    return this._valor;
  }
}
