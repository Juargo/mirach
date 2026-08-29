import type { Router, RequestHandler } from 'express';
import multer from 'multer';
import {
  ProcessIngestaUseCase,
  ProcessIngestaError,
} from '../../../application/use-cases/process-ingesta.use-case';
import { EliminarIngestaUseCase } from '../../../application/use-cases/eliminar-ingesta.use-case';
import { ListarIngestasUseCase } from '../../../application/use-cases/listar-ingestas.use-case';
import { PreviewIngestaUseCase } from '../../../application/use-cases/preview-ingesta.use-case';
import {
  CommitIngestaUseCase,
  CommitIngestaError,
} from '../../../application/use-cases/commit-ingesta.use-case';
import { MulterFileReaderAdapter } from '../../http/multer-file-reader.adapter';
import { aIngestaResponseDto } from '../../http/dto/ingesta-response.dto';
import { aIngestaListItemDto } from '../../http/dto/ingesta-list.dto';
import { aPreviewIngestaDto } from '../../http/dto/preview-ingesta.dto';
import {
  parseEdits,
  aCommitIngestaResponseDto,
} from '../../http/dto/commit-ingesta.dto';
import { PersistenciaFallidaError } from '../../../domain/errors/persistencia-fallida.error';
import { ExtensionNoPermitidaError } from '../../../domain/errors/extension-no-permitida.error';
import { BancoNoReconocidoError } from '../../../domain/errors/banco-no-reconocido.error';
import { EstructuraInvalidaError } from '../../../domain/errors/estructura-invalida.error';
import { NormalizacionInvalidaError } from '../../../domain/errors/normalizacion-invalida.error';
import { PdfInvalidoError } from '../../../domain/errors/pdf-invalido.error';
import { PdfSinTextoError } from '../../../domain/errors/pdf-sin-texto.error';
import { EstructuraPdfInvalidaError } from '../../../domain/errors/estructura-pdf-invalida.error';
import { RangoFechasInvalidoError } from '../../../domain/errors/rango-fechas-invalido.error';
import { CategorizacionFallidaError } from '../../../domain/errors/categorizacion-fallida.error';
import { EdicionesInvalidasError } from '../../../domain/errors/ediciones-invalidas.error';
import { RowIndexFueraDeRangoError } from '../../../domain/errors/row-index-fuera-de-rango.error';
import { CategoriaFueraDeCatalogoError } from '../../../domain/errors/categoria-fuera-de-catalogo.error';
import { IngestaNoEncontradaError } from '../../../domain/errors/ingesta-no-encontrada.error';
import { IngestaDemoSoloLecturaError } from '../../../domain/errors/ingesta-demo-solo-lectura.error';
import { esDemoDeSesion } from '../../http/auth/es-demo-de-sesion';
import { responderErrorTraducido } from './responder-error-traducido';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

/** Deps de `registrarIngestas` (US-018, design.md §6.1; +previewIngesta
 * US-003; +commitIngesta US-057 PR4). */
export interface IngestaRoutesDeps {
  processIngesta: ProcessIngestaUseCase;
  eliminarIngesta: EliminarIngestaUseCase;
  listarIngestas: ListarIngestasUseCase;
  previewIngesta: PreviewIngestaUseCase;
  /** Commit use case — the ONLY writer in the preview→commit split (US-057). */
  commitIngesta: CommitIngestaUseCase;
}

/**
 * registrarIngestas — port del IngestaController (ADR-028).
 *
 * POST /api/ingestas (multipart, campo `file`) → detectar → validar →
 * normalizar → persistir → categorizar (el mismo ProcessIngestaUseCase que usa
 * el CLI). `MulterFileReaderAdapter` (framework-agnóstico, reusado de http/)
 * traduce el `Express.Multer.File` al port `IFileReader`.
 *
 * GET /api/ingestas → lista las ingestas del usuario autenticado (US-018,
 * ING-03). DELETE /api/ingestas/:id → borrado en cascada userId-isolado
 * (US-018, ING-01/ING-02); 404 anti-enumeración cuando no existe o no es del
 * usuario, 204 sin body en éxito.
 *
 * Errores de validación del archivo del cliente → 400; fallo de infra
 * (persistencia) → 500. Todos los mensajes son seguros (nunca interpolan montos
 * ni datos crudos). El userId viene del session middleware.
 *
 * Demo gate (issue #500): las 3 superficies de escritura (POST one-shot,
 * POST /commit, DELETE) rechazan una sesión demo con 403 DEMO_SOLO_LECTURA
 * ANTES de cualquier side-effect — el gate vive en cada use case
 * (`IngestaDemoSoloLecturaError`, mirrors `*DemoSoloLecturaError` de
 * perfil/catálogo), este handler solo hilvana `esDemoDeSesion(req)` y mapea
 * el error. POST /preview NO gatea — es un dry-run de solo lectura (no
 * persiste nada, ver `PreviewIngestaUseCase`).
 *
 * `esDemoDeSesion(req)` (issue #507) reemplaza el `req.esDemo!` original —
 * fail-closed en vez de non-null assertion. Toda respuesta de error de
 * mutación (POST one-shot, POST /commit, DELETE) pasa por
 * `responderErrorTraducido` (issue #507, R2-WARNING del fan-out 4R) —
 * chokepoint único que loguea `logDemoGateTrip` (ADR-033) cuando
 * `code === 'DEMO_SOLO_LECTURA'`, incluido el branch de DELETE que resuelve
 * el error con `instanceof` en vez de un traductor `aXHttpError` dedicado.
 */
export function registrarIngestas(
  router: Router,
  deps: IngestaRoutesDeps,
): void {
  router.post('/ingestas', subirArchivo(), async (req, res, next) => {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({
          message:
            'No se recibió ningún archivo. Envía el archivo en el campo "file".',
        });
        return;
      }

      const fileReader = new MulterFileReaderAdapter(file);
      const result = await deps.processIngesta.execute({
        fileReader,
        userId: req.userId!,
        esDemo: esDemoDeSesion(req),
      });

      if (result.isFail()) {
        responderErrorTraducido(res, req, aHttpError(result.getError()));
        return;
      }

      res.status(200).json(aIngestaResponseDto(result.getValue()));
    } catch (err) {
      next(err);
    }
  });

  // POST /api/ingestas/preview (US-003, design.md §8, D1): sub-path distinto
  // (no un flag ?dryRun) — reusa el mismo gate multipart (`subirArchivo`) y el
  // mismo `aHttpError`. US-057 (D-12): preview AHORA escopa por tenant — el
  // dedup y las sugerencias del catálogo son per-usuario, así que forwarda
  // `userId` (deriva de sessionMiddleware, req.userId). Esto reemplaza la nota
  // §3.3 previa ("no forwarda userId") que quedó obsoleta con la extensión.
  router.post('/ingestas/preview', subirArchivo(), async (req, res, next) => {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({
          message:
            'No se recibió ningún archivo. Envía el archivo en el campo "file".',
        });
        return;
      }

      const fileReader = new MulterFileReaderAdapter(file);
      // US-057 PR2: PreviewIngestaInput now requires userId for per-row dedup scoping (D-06).
      const result = await deps.previewIngesta.execute({
        fileReader,
        userId: req.userId!,
      });

      if (result.isFail()) {
        const { status, message } = aHttpError(result.getError());
        res.status(status).json({ message });
        return;
      }

      res.status(200).json(aPreviewIngestaDto(result.getValue()));
    } catch (err) {
      next(err);
    }
  });

  // POST /api/ingestas/commit (US-057, design §1/D-02/D-03/D-13/D-18):
  // uses subirArchivoConEdits() — own multer instance with fieldSize: 256 KB (D-02).
  // Handler: parseEdits → 400 on fail; commitIngesta.execute → 201 with CommitIngestaResponseDto.
  router.post(
    '/ingestas/commit',
    subirArchivoConEdits(),
    async (req, res, next) => {
      try {
        const file = req.file;
        if (!file) {
          res.status(400).json({
            message:
              'No se recibió ningún archivo. Envía el archivo en el campo "file".',
          });
          return;
        }

        // Parse + shape-validate edits at the infra boundary (D-03).
        // req.body is typed as `any` by Express; narrow explicitly before passing.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const rawEdits: unknown = req.body?.edits;
        const editsResult = parseEdits(
          typeof rawEdits === 'string' ? rawEdits : undefined,
        );
        if (editsResult.isFail()) {
          const { status, message } = aCommitHttpError(editsResult.getError());
          res.status(status).json({ message });
          return;
        }

        const fileReader = new MulterFileReaderAdapter(file);
        const result = await deps.commitIngesta.execute({
          fileReader,
          userId: req.userId!,
          esDemo: esDemoDeSesion(req),
          edits: editsResult.getValue(),
        });

        if (result.isFail()) {
          responderErrorTraducido(
            res,
            req,
            aCommitHttpError(result.getError()),
          );
          return;
        }

        res.status(201).json(aCommitIngestaResponseDto(result.getValue()));
      } catch (err) {
        next(err);
      }
    },
  );

  router.get('/ingestas', async (req, res, next) => {
    try {
      const ingestas = await deps.listarIngestas.execute(req.userId!);
      res.status(200).json({ ingestas: ingestas.map(aIngestaListItemDto) });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/ingestas/:id', async (req, res, next) => {
    try {
      const result = await deps.eliminarIngesta.execute({
        userId: req.userId!,
        esDemo: esDemoDeSesion(req),
        ingestaId: req.params.id,
      });

      if (result.isFail()) {
        const error = result.getError();
        if (error instanceof IngestaDemoSoloLecturaError) {
          responderErrorTraducido(res, req, {
            status: 403,
            code: 'DEMO_SOLO_LECTURA',
            message: error.message,
          });
          return;
        }
        if (error instanceof IngestaNoEncontradaError) {
          responderErrorTraducido(res, req, {
            status: 404,
            message:
              'La cartola no existe o no pertenece al usuario autenticado.',
          });
          return;
        }
        const _exhaustive: never = error;
        void _exhaustive;
        responderErrorTraducido(res, req, {
          status: 500,
          message: 'Error inesperado',
        });
        return;
      }

      res.status(204).send();
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
 * subirArchivoConEdits — own multer instance for the commit route (D-02).
 *
 * Distinct from subirArchivo() — adds fieldSize: 256 KB for the `edits` text
 * field (≈ 4000 edit entries at ~64 B each). The shared subirArchivo() is NOT
 * modified; it keeps only fileSize and is used by the one-shot and preview routes.
 */
function subirArchivoConEdits(): RequestHandler {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: MAX_FILE_SIZE,
      fieldSize: 256 * 1024, // 256 KB cap for the edits JSON text field (D-02)
    },
  }).single('file');

  return (req, res, next) => {
    upload(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({
          message: 'El archivo excede el tamaño máximo permitido (10 MB).',
        });
        return;
      }
      // Un `edits` sobre el cap de `fieldSize` (256 KB) es validación del request
      // del cliente (no un fallo de infra): mapea a 400 con mensaje fijo, NUNCA
      // el payload. Multer emite el código `LIMIT_FIELD_VALUE` ("Field value too
      // long") cuando un valor de campo de texto supera `limits.fieldSize`.
      if (
        err instanceof multer.MulterError &&
        err.code === 'LIMIT_FIELD_VALUE'
      ) {
        res.status(400).json({
          message: 'El campo edits excede el tamaño máximo permitido (256 KB).',
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
 * aCommitHttpError — maps CommitIngestaError union to HTTP status + message.
 *
 * Exhaustive never guard (mirrors aHttpError above) — any new CommitIngestaError
 * member not handled here will produce a compile error (D-18).
 * Pipeline + overlay-validation errors → 400; infra errors → 500.
 */
function aCommitHttpError(error: CommitIngestaError): {
  status: number;
  message: string;
  code?: string;
} {
  // Demo gate (403, issue #500) — mismo código DEMO_SOLO_LECTURA que
  // perfil/catálogo (aPerfilHttpError/aCatalogoHttpError).
  if (error instanceof IngestaDemoSoloLecturaError) {
    return { status: 403, message: error.message, code: 'DEMO_SOLO_LECTURA' };
  }
  // Infrastructure errors → 500
  if (error instanceof PersistenciaFallidaError) {
    return { status: 500, message: error.message };
  }
  if (error instanceof CategorizacionFallidaError) {
    return { status: 500, message: error.message };
  }
  // Client errors (file + overlay validation) → 400
  if (
    error instanceof ExtensionNoPermitidaError ||
    error instanceof BancoNoReconocidoError ||
    error instanceof EstructuraInvalidaError ||
    error instanceof NormalizacionInvalidaError ||
    error instanceof PdfInvalidoError ||
    error instanceof PdfSinTextoError ||
    error instanceof EstructuraPdfInvalidaError ||
    error instanceof RangoFechasInvalidoError ||
    error instanceof EdicionesInvalidasError ||
    error instanceof RowIndexFueraDeRangoError ||
    error instanceof CategoriaFueraDeCatalogoError
  ) {
    return { status: 400, message: error.message };
  }
  const _exhaustive: never = error;
  void _exhaustive;
  return { status: 500, message: 'Error inesperado' };
}

/**
 * Mapea cada variante de ProcessIngestaError a su status. Explícito por tipo
 * con guarda de exhaustividad: una variante nueva sin mapear deja de compilar
 * en vez de caer a un status equivocado.
 */
function aHttpError(error: ProcessIngestaError): {
  status: number;
  message: string;
  code?: string;
} {
  if (error instanceof IngestaDemoSoloLecturaError) {
    // Demo gate (403, issue #500) — solo alcanzable desde POST /ingestas
    // (one-shot); PreviewIngestaError no incluye esta variante (dry-run,
    // no gatea).
    return { status: 403, message: error.message, code: 'DEMO_SOLO_LECTURA' };
  }
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
