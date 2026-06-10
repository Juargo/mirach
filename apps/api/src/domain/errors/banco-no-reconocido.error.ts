/**
 * BancoNoReconocidoError — error de dominio.
 *
 * Se lanza cuando el contenido del archivo no coincide con ninguno
 * de los formatos bancarios conocidos. Es un error de dominio porque
 * "reconocer el banco" es una regla de negocio central del sistema.
 */
export class BancoNoReconocidoError extends Error {
  constructor(nombreArchivo: string) {
    super(
      `No se pudo identificar el banco emisor del archivo "${nombreArchivo}". ` +
        `Bancos soportados: Banco de Chile, BancoEstado, BCI, Santander.`,
    );
    this.name = 'BancoNoReconocidoError';
  }
}
