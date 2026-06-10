/**
 * ExtensionNoPermitidaError — error de dominio.
 *
 * Se lanza cuando un archivo bancario tiene una extensión que el sistema
 * no acepta. Pertenece al dominio porque la regla "solo .xls y .xlsx"
 * es una invariante de negocio, no una restricción técnica.
 */
export class ExtensionNoPermitidaError extends Error {
  constructor(extension: string, permitidas: readonly string[]) {
    super(
      `Extensión de archivo no permitida: "${extension}". ` +
        `Se aceptan: ${permitidas.join(', ')}`,
    );
    this.name = 'ExtensionNoPermitidaError';
  }
}
