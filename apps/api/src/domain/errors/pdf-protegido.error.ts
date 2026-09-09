/** Discrimina por qué un PDF protegido no pudo desbloquearse. */
export type MotivoPdfProtegido = 'requiere-password' | 'password-incorrecta';

/**
 * PdfProtegidoError — error de dominio.
 *
 * Se lanza cuando un PDF está cifrado con password (pdfjs lanza
 * `PasswordException`) y, o bien no se entregó ninguna password, o bien la
 * entregada es incorrecta. Es un error de dominio distinto de
 * `PdfInvalidoError` porque "requiere una password para desbloquearse" es
 * una condición de negocio verificable (el usuario puede resolverla
 * reintentando con la password correcta), no un archivo corrupto o
 * ilegible — confundirlos históricamente colapsaba ambos casos en un
 * mensaje genérico de "PDF inválido" sin dar al usuario ninguna acción
 * posible (ver design.md, D-03).
 *
 * El constructor NO recibe la password como parámetro — no hay forma de
 * interpolarla en el mensaje aunque se quisiera (D-07, capa 1: control
 * estructural, no una promesa de buen comportamiento). pdfjs-dist queda
 * confinado a infrastructure/pdf (ADR-005); este archivo no lo conoce.
 */
export class PdfProtegidoError extends Error {
  constructor(
    nombreArchivo: string,
    readonly motivo: MotivoPdfProtegido,
  ) {
    super(
      motivo === 'requiere-password'
        ? `El archivo "${nombreArchivo}" está protegido y requiere una clave para poder leerse.`
        : `La clave ingresada para el archivo "${nombreArchivo}" es incorrecta.`,
    );
    this.name = 'PdfProtegidoError';
  }
}
