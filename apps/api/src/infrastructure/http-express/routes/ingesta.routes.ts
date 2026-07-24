import type { Router, RequestHandler } from 'express';
import multer from 'multer';
import {
  ProcessIngestaUseCase,
  ProcessIngestaError,
} from '../../../application/use-cases/process-ingesta.use-case';
import { MulterFileReaderAdapter } from '../../http/multer-file-reader.adapter';
import { aIngestaResponseDto } from '../../http/dto/ingesta-response.dto';
import { PersistenciaFallidaError } from '../../../domain/errors/persistencia-fallida.error';
import { ExtensionNoPermitidaError } from '../../../domain/errors/extension-no-permitida.error';
import { BancoNoReconocidoError } from '../../../domain/errors/banco-no-reconocido.error';
import { EstructuraInvalidaError } from '../../../domain/errors/estructura-invalida.error';
import { NormalizacionInvalidaError } from '../../../domain/errors/normalizacion-invalida.error';
import { PdfInvalidoError } from '../../../domain/errors/pdf-invalido.error';
import { PdfSinTextoError } from '../../../domain/errors/pdf-sin-texto.error';
import { EstructuraPdfInvalidaError } from '../../../domain/errors/estructura-pdf-invalida.error';
import { RangoFechasInvalidoError } from '../../../domain/errors/rango-fechas-invalido.error';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

/**
 * registrarIngestas — port del IngestaController (ADR-028).
 *
 * POST /api/ingestas (multipart, campo `file`) → detectar → validar →
 * normalizar → persistir → categorizar (el mismo ProcessIngestaUseCase que usa
 * el CLI). `MulterFileReaderAdapter` (framework-agnóstico, reusado de http/)
 * traduce el `Express.Multer.File` al port `IFileReader`.
 *
 * Errores de validación del archivo del cliente → 400; fallo de infra
 * (persistencia) → 500. Todos los mensajes son seguros (nunca interpolan montos
 * ni datos crudos). El userId viene del session middleware.
 */
export function registrarIngestas(
  router: Router,
  processIngesta: ProcessIngestaUseCase,
): void {
  router.post('/ingestas', subirArchivo(), async (req, res, next) => {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({
          message: 'No se recibió ningún archivo. Envía el archivo en el campo "file".',
        });
        return;
      }

      const fileReader = new MulterFileReaderAdapter(file);
      const result = await processIngesta.execute({ fileReader, userId: req.userId! });

      if (result.isFail()) {
        const { status, message } = aHttpError(result.getError());
        res.status(status).json({ message });
        return;
      }

      res.status(200).json(aIngestaResponseDto(result.getValue()));
    } catch (err) {
      next(err);
    }
  });
}

/**
 * subirArchivo — multer en memoria (sin escribir a disco, límite 10 MB) +
 * traducción del error `LIMIT_FILE_SIZE` a 400 (el equivalente del
 * UploadTooLargeFilter de Nest: un archivo sobre el límite es validación del
 * archivo del cliente, no un 413/500).
 */
function subirArchivo(): RequestHandler {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE },
  }).single('file');

  return (req, res, next) => {
    upload(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({
          message: 'El archivo excede el tamaño máximo permitido (10 MB).',
        });
        return;
      }
      if (err) {
        next(err);
        return;
      }
      next();
    });
  };
}

/**
 * Mapea cada variante de ProcessIngestaError a su status. Explícito por tipo
 * con guarda de exhaustividad: una variante nueva sin mapear deja de compilar
 * en vez de caer a un status equivocado.
 */
function aHttpError(error: ProcessIngestaError): { status: number; message: string } {
  if (error instanceof PersistenciaFallidaError) {
    // Fallo de infraestructura (DB) — no es culpa del archivo enviado.
    return { status: 500, message: error.message };
  }
  if (
    error instanceof ExtensionNoPermitidaError ||
    error instanceof BancoNoReconocidoError ||
    error instanceof EstructuraInvalidaError ||
    error instanceof NormalizacionInvalidaError ||
    error instanceof PdfInvalidoError ||
    error instanceof PdfSinTextoError ||
    error instanceof EstructuraPdfInvalidaError ||
    error instanceof RangoFechasInvalidoError
  ) {
    // Errores de validación del archivo enviado por el cliente.
    return { status: 400, message: error.message };
  }
  const _exhaustive: never = error;
  void _exhaustive;
  return { status: 500, message: 'Error inesperado' };
}
