import {
  Controller,
  Post,
  UploadedFile,
  UseFilters,
  UseInterceptors,
  BadRequestException,
  InternalServerErrorException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ProcessIngestaUseCase,
  ProcessIngestaError,
} from '../../application/use-cases/process-ingesta.use-case';
import { PersistenciaFallidaError } from '../../domain/errors/persistencia-fallida.error';
import { ExtensionNoPermitidaError } from '../../domain/errors/extension-no-permitida.error';
import { BancoNoReconocidoError } from '../../domain/errors/banco-no-reconocido.error';
import { EstructuraInvalidaError } from '../../domain/errors/estructura-invalida.error';
import { NormalizacionInvalidaError } from '../../domain/errors/normalizacion-invalida.error';
import { MulterFileReaderAdapter } from './multer-file-reader.adapter';
import { aIngestaResponseDto } from './dto/ingesta-response.dto';
import { USER_ID_FIJO } from '../persistence/constants';
import { UploadTooLargeFilter } from './upload-too-large.filter';

/**
 * IngestaController — endpoint de ingesta de archivos bancarios.
 *
 * Vive en infrastructure/http porque depende de NestJS y HTTP.
 * Su única responsabilidad es:
 *   1. Recibir el archivo multipart
 *   2. Crear el adapter y llamar a ProcessIngestaUseCase (el mismo
 *      orquestador que usa el CLI — detectar → asegurar cuenta → validar →
 *      normalizar → persistir; CLI y HTTP comparten un único pipeline)
 *   3. Traducir el Result<T,E> a respuesta HTTP
 *
 * No contiene lógica de negocio. USER_ID_FIJO es la constante de
 * infraestructura del MVP mono-usuario (US-011) — nunca viene del request.
 */
@Controller('api/ingestas')
export class IngestaController {
  constructor(private readonly processIngestaUseCase: ProcessIngestaUseCase) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @UseFilters(UploadTooLargeFilter)
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
    const result = await this.processIngestaUseCase.execute({
      fileReader,
      userId: USER_ID_FIJO,
    });

    if (result.isFail()) {
      throw this.aHttpException(result.getError());
    }

    return aIngestaResponseDto(result.getValue());
  }

  /**
   * Mapea cada variante de ProcessIngestaError a su HttpException. Explícito
   * por tipo (no un `instanceof X ? 500 : 400` genérico) con un chequeo de
   * exhaustividad en tiempo de compilación: si ProcessIngestaError gana una
   * variante nueva sin mapearla aquí, esta función deja de compilar en vez
   * de caer silenciosamente a un status equivocado.
   *
   * Todos los mensajes son seguros: ningún error de este pipeline interpola
   * montos u otros datos sensibles (ver PersistenciaFallidaError y los
   * errores de dominio de extensión/banco/estructura/normalización — sus
   * mensajes reportan solo fila/columna/campo, nunca el valor crudo).
   */
  private aHttpException(
    error: ProcessIngestaError,
  ): BadRequestException | InternalServerErrorException {
    if (error instanceof PersistenciaFallidaError) {
      // Fallo de infraestructura (DB) — no es culpa del archivo enviado.
      return new InternalServerErrorException(error.message);
    }
    if (
      error instanceof ExtensionNoPermitidaError ||
      error instanceof BancoNoReconocidoError ||
      error instanceof EstructuraInvalidaError ||
      error instanceof NormalizacionInvalidaError
    ) {
      // Errores de validación del archivo enviado por el cliente.
      return new BadRequestException(error.message);
    }
    const exhaustivo: never = error;
    return exhaustivo;
  }
}
