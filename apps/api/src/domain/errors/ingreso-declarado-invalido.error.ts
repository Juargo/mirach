/**
 * IngresoDeclaradoInvalidoError — error de dominio.
 *
 * Se produce cuando el ingreso mensual declarado (PER-02) no es un monto
 * positivo en pesos. El mensaje no incluye el monto (los montos se
 * scrubben de los errores). HTTP: 400 `INGRESO_DECLARADO_INVALIDO`.
 */
export class IngresoDeclaradoInvalidoError extends Error {
  constructor() {
    super('El ingreso declarado debe ser un monto positivo en pesos.');
    this.name = 'IngresoDeclaradoInvalidoError';
  }
}
