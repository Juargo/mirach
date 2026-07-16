/**
 * PdfInvalidoError — error de dominio.
 *
 * Se lanza cuando un archivo PDF está corrupto o no es interpretable como
 * PDF (estructura inválida, buffer truncado, etc). Es un error de dominio
 * porque "el archivo debe ser un PDF válido" es una invariante de negocio
 * de la ingesta, no un detalle de la librería de parseo usada
 * (pdfjs-dist queda confinado a infrastructure/pdf — ver ADR-005).
 */
export class PdfInvalidoError extends Error {
  constructor(nombreArchivo: string) {
    super(
      `El archivo "${nombreArchivo}" no se pudo interpretar como PDF (está corrupto o su estructura es inválida).`,
    );
    this.name = 'PdfInvalidoError';
  }
}
