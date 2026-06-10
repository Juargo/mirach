/**
 * IFileReader — puerto de lectura de archivo.
 *
 * Abstracción que representa un archivo subido por el usuario.
 * La capa de application depende de esta interfaz, nunca de Multer
 * ni de ningún detalle de infraestructura HTTP.
 *
 * La implementación concreta (MulterFileReaderAdapter) vive en
 * infrastructure/http y es inyectada por el Composition Root.
 */
export interface IFileReader {
  /** Contenido binario del archivo. */
  getBuffer(): Buffer;

  /** Nombre original del archivo tal como lo envió el usuario. */
  getOriginalName(): string;

  /** Tamaño del archivo en bytes. */
  getSizeInBytes(): number;
}
