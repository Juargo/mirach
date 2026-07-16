/**
 * PdfSinTextoError — error de dominio.
 *
 * Se lanza cuando un PDF es válido pero no tiene ninguna capa de texto
 * extraíble (ej: cartola escaneada como imagen). El sistema NO hace OCR
 * (CA-07, decisión de alcance) — este error es la forma controlada de
 * rechazar ese caso en vez de fallar silenciosamente con cero movimientos.
 */
export class PdfSinTextoError extends Error {
  constructor(nombreArchivo: string) {
    super(
      `El archivo "${nombreArchivo}" no tiene texto extraíble (¿es una imagen escaneada? no se hace OCR).`,
    );
    this.name = 'PdfSinTextoError';
  }
}
