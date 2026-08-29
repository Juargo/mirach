import type { RequestHandler } from 'express';
import { extractToken } from '../../http/auth/extraer-token';
import { ValidarSesionUseCase } from '../../../application/use-cases/validar-sesion.use-case';
import { SesionInvalidaError } from '../../../domain/errors/sesion-invalida.error';
import { appLogger } from '../../logging/app-logger';

/**
 * sessionMiddleware — port 1:1 del `SessionGuard` (ADR-028), corre DESPUÉS de
 * `apiKeyMiddleware`.
 *
 * Factory con closure-DI: recibe el `ValidarSesionUseCase` del composition root
 * (no hay contenedor de DI en runtime). Exige un token — cookie `md_session` O
 * `Authorization: Bearer`, con precedencia de cookie vía `extractToken` — y
 * delega hashing/lookup/expiración al mismo use case sin importar el transporte.
 *
 * Éxito → escribe `req.userId` (tipado en express-request.d.ts) y sigue.
 * Fallo → 401 scrubbeado: se loguea SOLO el path, nunca el token/cookie/header.
 *
 * Las rutas session-public (login/demo) NO montan este middleware pero sí el de
 * api-key — el equivalente Express de `@PublicSession()`.
 */
export function sessionMiddleware(
  validarSesion: ValidarSesionUseCase,
): RequestHandler {
  return async (req, res, next) => {
    const token = extractToken(req);

    if (token === undefined) {
      appLogger.warn('Sesión rechazada (sin token)', { path: req.path });
      res.status(401).json({ message: new SesionInvalidaError().message });
      return;
    }

    const result = await validarSesion.execute({ token });

    if (result.isFail()) {
      appLogger.warn('Sesión rechazada (token inválido/expirado)', {
        path: req.path,
      });
      res.status(401).json({ message: new SesionInvalidaError().message });
      return;
    }

    const sesion = result.getValue();
    req.userId = sesion.userId;
    req.esDemo = sesion.esDemo;

    // Invariante en runtime (issue #507): `ValidarSesionResult.esDemo:
    // boolean` ya lo prohíbe en compile-time, pero TypeScript no protege
    // contra un mapper/repo aguas abajo que devuelva `undefined` en runtime.
    // Esta rama NUNCA debería alcanzarse — es un cinturón, no un camino
    // esperado — pero si se alcanza, fail-closed (`true`) en vez de dejar
    // pasar el valor malformado a `esDemoDeSesion`/los use cases.
    if (typeof req.esDemo !== 'boolean') {
      appLogger.error(
        'sessionMiddleware: invariante violada — esDemo no es boolean tras validar sesión',
        { path: req.path },
      );
      req.esDemo = true;
    }

    req.sessionTokenHash = sesion.tokenHash;
    next();
  };
}
