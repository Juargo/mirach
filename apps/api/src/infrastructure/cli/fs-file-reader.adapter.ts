import * as fs from 'fs';
import * as path from 'path';
import { IFileReader } from '../../application/ports/file-reader.port';

/**
 * FsFileReaderAdapter — adapter de infraestructura para CLI.
 *
 * Implementa IFileReader leyendo desde el sistema de archivos local.
 * Es el equivalente de MulterFileReaderAdapter pero para entradas de CLI
 * en lugar de multipart/form-data.
 *
 * El use case no sabe si el archivo vino de HTTP o del filesystem —
 * eso es exactamente lo que queremos.
 */
export class FsFileReaderAdapter implements IFileReader {
  private readonly _buffer: Buffer;
  private readonly _originalName: string;
  private readonly _sizeInBytes: number;

  constructor(filePath: string) {
    const resolvedPath = path.resolve(filePath);

    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Archivo no encontrado: ${resolvedPath}`);
    }

    this._buffer = fs.readFileSync(resolvedPath);
    this._originalName = path.basename(resolvedPath);
    this._sizeInBytes = this._buffer.length;
  }

  getBuffer(): Buffer {
    return this._buffer;
  }

  getOriginalName(): string {
    return this._originalName;
  }

  getSizeInBytes(): number {
    return this._sizeInBytes;
  }
}
