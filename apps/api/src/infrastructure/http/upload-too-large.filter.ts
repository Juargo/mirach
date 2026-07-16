import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { Response } from 'express';

/**
 * UploadTooLargeFilter — normaliza PayloadTooLargeException (413) a 400.
 *
 * NestJS mapea internamente el error `LIMIT_FILE_SIZE` de Multer a 413
 * (ver `@nestjs/platform-express` `multer.utils.ts` `transformException`).
 * Ese mapeo ocurre en el interceptor, ANTES de que el controller se
 * ejecute, así que no se puede normalizar con un try/catch dentro de
 * `IngestaController.ingestar()`.
 *
 * Este endpoint ya trata TODO problema del archivo enviado por el cliente
 * (extensión, banco, estructura, normalización) como 400 — solo fallas de
 * infraestructura (persistencia) son 500. Un archivo sobre el límite de
 * tamaño es la misma categoría (validación del archivo del cliente), así
 * que este filtro homogeneiza ÚNICAMENTE ese caso puntual con la
 * convención local del endpoint.
 */
@Catch(PayloadTooLargeException)
export class UploadTooLargeFilter implements ExceptionFilter {
  catch(_exception: PayloadTooLargeException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const normalized = new BadRequestException(
      'El archivo excede el tamaño máximo permitido (10 MB).',
    );
    response.status(normalized.getStatus()).json(normalized.getResponse());
  }
}
