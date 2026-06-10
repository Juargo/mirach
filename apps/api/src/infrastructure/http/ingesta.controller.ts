import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { IngestFileUseCase } from '../../application/use-cases/ingest-file.use-case';
import { MulterFileReaderAdapter } from './multer-file-reader.adapter';

/**
 * IngestaController — endpoint de ingesta de archivos bancarios.
 *
 * Vive en infrastructure/http porque depende de NestJS y HTTP.
 * Su única responsabilidad es:
 *   1. Recibir el archivo multipart
 *   2. Crear el adapter y llamar al use case
 *   3. Traducir el Result<T,E> a respuesta HTTP
 *
 * No contiene lógica de negocio.
 */
@Controller('api/ingestas')
export class IngestaController {
  constructor(private readonly ingestFileUseCase: IngestFileUseCase) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(), // buffer en memoria, sin escribir a disco
      limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB máximo
    }),
  )
  async ingestar(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException(
        'No se recibió ningún archivo. Envía el archivo en el campo "file".',
      );
    }

    const fileReader = new MulterFileReaderAdapter(file);
    const result = this.ingestFileUseCase.execute(fileReader);

    if (result.isFail()) {
      throw new BadRequestException(result.getError().message);
    }

    const data = result.getValue();

    return {
      message: 'Archivo recibido correctamente.',
      archivo: {
        nombre: data.originalName,
        extension: data.extension,
        tamano_bytes: data.sizeInBytes,
      },
    };
  }
}
