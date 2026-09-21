import type { ErrorRequestHandler } from 'express';
import { appLogger } from '../../logging/app-logger';

/**
 * CODIGO_DE_MAQUINA — un `code` se considera seguro para el log SOLO si es un
 * token enumerado: mayúscula inicial, luego mayúsculas, dígitos o `_`, hasta
 * 32 caracteres. Admite lo que sirve para diagnosticar (`P2022` de Prisma,
 * `ECONNREFUSED` de Node, `FECHA_FUTURA` de un error de dominio) y excluye
 * cualquier string libre.
 *
 * El largo y la forma NO son decoración: un `code` enumerado sale de un set
 * cerrado y por construcción no transporta datos del request, mientras que un
 * string libre podría traer interpolado un monto, un email o una descripción
 * (ADR-013). La regla es por FORMA, no por tipo de error, así ningún error
 * futuro entra por defecto a la zona insegura.
 */
const CODIGO_DE_MAQUINA = /^[A-Z][A-Z0-9_]{1,31}$/;

function codigoSeguro(err: unknown): string | undefined {
  const code: unknown = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' && CODIGO_DE_MAQUINA.test(code)
    ? code
    : undefined;
}

/**
 * Error-handling middleware central (ADR-028) — reemplaza los ExceptionFilters
 * y el mapeo de HttpException de Nest.
 *
 * Es la red de seguridad para errores INESPERADOS o lanzados: loguea la causa
 * real server-side (nunca reflejada al cliente) y responde un 500 genérico y
 * scrubbeado. El mapeo de errores de dominio CONOCIDOS (400/401) vive en cada
 * handler vía Result<T,E>; este middleware solo atrapa lo que se escapa.
 *
 * El log lleva `errorName` y, cuando existe y tiene forma de token enumerado,
 * `errorCode`. El motivo es diagnóstico: un `PrismaClientKnownRequestError`
 * pelado no distingue una columna inexistente (P2022) de un unique violado
 * (P2002) ni de una base inalcanzable (P1001), y esa diferencia es todo el
 * trabajo de encontrar la falla. La RESPUESTA no cambia: sigue siendo el mismo
 * 500 genérico y byte-idéntico para toda causa (AUTH-15). La distinción es
 * deliberada — el scrubbing protege al cliente, no al operador del servidor.
 *
 * Nunca se loguea `err.message`: ahí es donde un error de librería SÍ puede
 * traer interpolado el valor que causó la falla.
 *
 * Debe registrarse ÚLTIMO y con los 4 argumentos: Express identifica un
 * error-handler por su aridad.
 */
export const errorMiddleware: ErrorRequestHandler = (err, _req, res, _next) => {
  const errorCode = codigoSeguro(err);

  appLogger.error('Error inesperado en la API', {
    errorName: err instanceof Error ? err.name : 'UnknownError',
    ...(errorCode !== undefined && { errorCode }),
  });
  res.status(500).json({
    message: 'Error inesperado. Intenta nuevamente.',
  });
};
