import { IFileReader } from '../ports/file-reader.port';
import { Result } from '../../shared/result';
import { Extension } from '../../domain/value-objects/extension';
import { ExtensionNoPermitidaError } from '../../domain/errors/extension-no-permitida.error';

// Re-exportamos el error para que el spec y el controller no cambien sus imports.
// Es un alias de conveniencia, no lógica de aplicación.
export { ExtensionNoPermitidaError as InvalidFileExtensionError };

/** Datos de salida del use case (por ahora, metadata del archivo). */
export interface IngestFileResult {
  originalName: string;
  sizeInBytes: number;
  extension: string;
  buffer: Buffer;
}

/**
 * IngestFileUseCase — orquesta la ingesta de un archivo bancario.
 *
 * Responsabilidades:
 *   1. Delegar la validación de extensión al value object Extension (dominio)
 *   2. Extraer bytes y metadata para pasarlos al siguiente paso
 *
 * NO parsea, NO detecta banco, NO persiste — solo valida y delega.
 * Retorna Result<T,E> en lugar de lanzar excepciones.
 */
export class IngestFileUseCase {
  execute(fileReader: IFileReader): Result<IngestFileResult, ExtensionNoPermitidaError> {
    const originalName = fileReader.getOriginalName();

    let extension: Extension;
    try {
      extension = Extension.desdeNombreArchivo(originalName);
    } catch (error) {
      if (error instanceof ExtensionNoPermitidaError) {
        return Result.fail(error);
      }
      throw error; // error inesperado — propagamos sin envolver
    }

    return Result.ok({
      originalName,
      sizeInBytes: fileReader.getSizeInBytes(),
      extension: extension.valor,
      buffer: fileReader.getBuffer(),
    });
  }
}
