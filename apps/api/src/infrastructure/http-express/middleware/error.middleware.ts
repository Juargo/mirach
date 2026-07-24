import type { ErrorRequestHandler } from 'express';

/**
 * Error-handling middleware central (ADR-028) — reemplaza los ExceptionFilters
 * y el mapeo de HttpException de Nest.
 *
 * Es la red de seguridad para errores INESPERADOS o lanzados: loguea la causa
 * real server-side (nunca reflejada al cliente) y responde un 500 genérico y
 * scrubbeado. El mapeo de errores de dominio CONOCIDOS (400/401) vive en cada
 * handler vía Result<T,E>; este middleware solo atrapa lo que se escapa.
 *
 * Debe registrarse ÚLTIMO y con los 4 argumentos: Express identifica un
 * error-handler por su aridad.
 */
export const errorMiddleware: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(
    'Error inesperado en la API',
    err instanceof Error ? err.stack : String(err),
  );
  res.status(500).json({
    message: 'Error inesperado. Intenta nuevamente.',
  });
};
