/**
 * NombreBanco — value object de dominio.
 *
 * Representa el banco emisor de un archivo de movimientos.
 * Solo puede contener uno de los valores conocidos; cualquier otro
 * valor no puede instanciarse — la validación ocurre en BankDetector.
 */
export enum BancoConocido {
  BancoChile = 'Banco de Chile',
  BancoEstado = 'BancoEstado',
  BCI = 'BCI',
  Santander = 'Santander',
}

export class NombreBanco {
  private constructor(private readonly _valor: BancoConocido) {}

  static de(valor: BancoConocido): NombreBanco {
    return new NombreBanco(valor);
  }

  get valor(): BancoConocido {
    return this._valor;
  }

  equals(other: NombreBanco): boolean {
    return this._valor === other._valor;
  }

  toString(): string {
    return this._valor;
  }
}
