import type { Router } from 'express';
import type { CrearCuentaAnonimaUseCase } from '../../../application/use-cases/crear-cuenta-anonima.use-case';
import type { IpRateLimiter } from '../../http/auth/ip-rate-limiter';
import { getClientIp } from '../../http/auth/client-ip';
import { appLogger } from '../../logging/app-logger';
import { SERVICIO_NO_DISPONIBLE_BODY } from '../auth-error-codes';
import { versionDe } from '../schemas/consentimientos.schema';
import { TERMINOS_NO_ACEPTADOS } from '../schemas/cuenta-anonima.schema';

const RATE_LIMITED_BODY = {
  message: 'Demasiadas solicitudes. Intenta más tarde.',
};

export interface AuthAnonimoDeps {
  readonly crearCuentaAnonima: CrearCuentaAnonimaUseCase;
  readonly altaRateLimiter: IpRateLimiter;
}

/**
 * registrarAuthAnonimo — `POST /api/auth/anonimo` (ADR-013). Session-public:
 * exige solo la `x-api-key`. Crea una cuenta sin Apple, Google ni email y
 * responde `{ token, userId, expiresAt }` como las demás rutas de sesión.
 *
 * Rate limiter: cada petición cuenta contra el presupuesto de la IP y un alta
 * exitosa NUNCA lo libera; es el único freno contra la creación masiva de
 * cuentas, porque la `x-api-key` es pública.
 */
export function registrarAuthAnonimo(
  router: Router,
  deps: AuthAnonimoDeps,
): void {
  const { crearCuentaAnonima, altaRateLimiter } = deps;

  router.post('/auth/anonimo', async (req, res) => {
    try {
      const ip = getClientIp(req);
      if (altaRateLimiter.isBlocked(ip)) {
        appLogger.warn('Alta anónima rechazada (rate-limited)', {
          path: req.path,
        });
        res.status(429).json(RATE_LIMITED_BODY);
        return;
      }
      altaRateLimiter.recordFailure(ip);

      const body = req.body as Record<string, unknown> | undefined;
      const resultado = await crearCuentaAnonima.execute({
        terminos: versionDe(body?.versionTerminos),
        privacidad: versionDe(body?.versionPrivacidad),
      });

      if (resultado.isFail()) {
        appLogger.warn('Alta anónima rechazada', {
          path: req.path,
          motivo: resultado.getError().motivo,
        });
        res.status(400).json({
          message: 'Debes aceptar los términos y la política de privacidad.',
          code: TERMINOS_NO_ACEPTADOS,
        });
        return;
      }

      const { token, userId, expiresAt } = resultado.getValue();
      res
        .status(200)
        .json({ token, userId, expiresAt: expiresAt.toISOString() });
    } catch (err) {
      appLogger.error('Alta anónima rechazada (fallo inesperado)', {
        path: req.path,
        errorName: err instanceof Error ? err.name : 'UnknownError',
      });
      res.status(503).json(SERVICIO_NO_DISPONIBLE_BODY);
    }
  });
}
