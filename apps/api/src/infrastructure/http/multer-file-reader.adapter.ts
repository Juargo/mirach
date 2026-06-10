import { IFileReader } from '../../application/ports/file-reader.port';

/**
 * MulterFileReaderAdapter — implementación concreta de IFileReader.
 *
 * Traduce el objeto Express.Multer.File (proveniente del decorador
 * @UploadedFile de NestJS) al contrato IFileReader que usa la capa
 * de application.
 *
 * Vive en infrastructure porque depende de un detalle técnico (Multer).
 * La capa de domain y application nunca importan esta clase directamente.
 */
export class MulterFileReaderAdapter implements IFileReader {
  constructor(private readonly file: Express.Multer.File) {}

  getBuffer(): Buffer {
    return this.file.buffer;
  }

  getOriginalName(): string {
    return this.file.originalname;
  }

  getSizeInBytes(): number {
    return this.file.size;
  }
}
