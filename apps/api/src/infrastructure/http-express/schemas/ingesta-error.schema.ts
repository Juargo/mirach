import { z } from 'zod';

/**
 * Error bodies of the upload endpoints (`POST /api/ingestas`,
 * `POST /api/ingestas/preview`, `POST /api/ingestas/commit`). Every body is
 * `{ message, code? }` (`responderErrorTraducido`). `code` is present only for
 * the causes a client must tell apart; the other 400 causes (disallowed
 * extension, unrecognized bank, invalid structure, oversized file, ...) carry
 * `message` alone and clients show it as-is.
 *
 * The 400 `code` enum is closed: it mirrors `aHttpError`/`aCommitHttpError` in
 * `routes/ingesta.routes.ts`. 409 and 503 each have exactly one code, so they
 * get their own literal-typed schema.
 */
export const CODIGOS_INGESTA_400 = [
  'PDF_PROTEGIDO',
  'PDF_PASSWORD_INCORRECTA',
  'SIN_MOVIMIENTOS',
] as const;

export const ingestaErrorResponseSchema = z
  .object({
    message: z.string(),
    code: z
      .enum(CODIGOS_INGESTA_400)
      .optional()
      .describe(
        'PDF_PROTEGIDO: the PDF is encrypted and no `password` was sent — ask the user for it. ' +
          'PDF_PASSWORD_INCORRECTA: the `password` sent does not unlock the PDF — ask again. ' +
          'SIN_MOVIMIENTOS: the file is valid but holds zero movements. Absent for every other 400 cause.',
      ),
  })
  .meta({
    id: 'IngestaErrorResponse',
    description:
      '400 body of the upload endpoints. `code` is present only for PDF_PROTEGIDO, ' +
      'PDF_PASSWORD_INCORRECTA and SIN_MOVIMIENTOS.',
  });

export const ingestaCatalogoIncompletoResponseSchema = z
  .object({
    message: z.string(),
    code: z.literal('CATALOGO_INCOMPLETO'),
  })
  .meta({
    id: 'IngestaCatalogoIncompletoResponse',
    description:
      '409 body: the category catalog is available but incomplete (the default "Desconocido" ' +
      "category of a bucket is missing). Permanent until the account's catalog is repaired — " +
      'retrying the same request does not help.',
  });

export const ingestaCatalogoNoDisponibleResponseSchema = z
  .object({
    message: z.string(),
    code: z.literal('CATALOGO_NO_DISPONIBLE'),
  })
  .meta({
    id: 'IngestaCatalogoNoDisponibleResponse',
    description:
      '503 body: a transient fault on our side while classifying; nothing was imported. ' +
      'Retrying later may succeed.',
  });

/**
 * Generic 500 body, byte-identical for every cause (`errorMiddleware`, AUTH-15)
 * and for `PersistenciaFallidaError` (message only, no `code`).
 */
export const serverErrorResponseSchema = z
  .object({ message: z.string() })
  .meta({
    id: 'ServerErrorResponse',
    description: '500 body: `{ message }` only, no `code`.',
  });
