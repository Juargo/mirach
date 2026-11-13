import type { Router } from 'express';
import type { FusionarCuentaUseCase } from '../../../application/use-cases/fusionar-cuenta.use-case';
import type { IpRateLimiter } from '../../http/auth/ip-rate-limiter';
import { getClientIp } from '../../http/auth/client-ip';
import { appLogger } from '../../logging/app-logger';
import { SERVICIO_NO_DISPONIBLE_BODY } from '../auth-error-codes';
import {
  DESTINO_ANONIMO,
  ORIGEN_INVALIDO,
  cuentaFusionarRequestSchema,
} from '../schemas/cuenta-anonima.schema';

const RATE_LIMITED_BODY = {
  message: 'Demasiadas solicitudes. Intenta más tarde.',
};

const BODY_INVALIDO = {
  message: 'Cuerpo de la petición inválido.',
  code: 'BODY_INVALIDO',
};

const CODIGO_409 = {
  'origen-invalido': ORIGEN_INVALIDO,
  'destino-anonimo': DESTINO_ANONIMO,
} as const;

export interface CuentaFusionarDeps {
  readonly fusionarCuenta: FusionarCuentaUseCase;
  readonly fusionarRateLimiter: IpRateLimiter;
}

/**
 * registrarCuentaFusionar — `POST /api/cuenta/fusionar` (ADR-014). Ruta
 * protegida: el destino es SIEMPRE `req.userId`, nunca un valor del body; el
 * origen sale del `tokenOrigen`, que prueba ser dueño de esa cuenta anónima.
 *
 * Un token de origen malo responde 409 `ORIGEN_INVALIDO`, NO 401: en una ruta
 * con sesión un 401 significa "sesión inválida" y la app cerraría la sesión
 * del destino, que es la buena.
 *
 * Nunca se loguea el token de origen. Un fallo inesperado responde 503: la
 * transacción de la fusión se revirtió y no se escribió nada.
 */
export function registrarCuentaFusionar(
  router: Router,
  deps: CuentaFusionarDeps,
): void {
  const { fusionarCuenta, fusionarRateLimiter } = deps;

  router.post('/cuenta/fusionar', async (req, res) => {
    try {
      const ip = getClientIp(req);
      if (fusionarRateLimiter.isBlocked(ip)) {
        appLogger.warn('Fusión rechazada (rate-limited)', { path: req.path });
        res.status(429).json(RATE_LIMITED_BODY);
        return;
      }
      // Cada intento cuenta; solo una fusión exitosa libera el presupuesto.
      fusionarRateLimiter.recordFailure(ip);

      const body = cuentaFusionarRequestSchema.safeParse(req.body);
      if (!body.success) {
        res.status(400).json(BODY_INVALIDO);
        return;
      }

      const resultado = await fusionarCuenta.execute({
        destinoUserId: req.userId!,
        tokenOrigen: body.data.tokenOrigen,
      });

      if (resultado.isFail()) {
        const error = resultado.getError();
        appLogger.warn('Fusión rechazada', {
          path: req.path,
          motivo: error.motivo,
        });
        res
          .status(409)
          .json({ message: error.message, code: CODIGO_409[error.motivo] });
        return;
      }

      fusionarRateLimiter.reset(ip);
      res.status(200).json(resultado.getValue());
    } catch (err) {
      appLogger.error('Fusión rechazada (fallo inesperado)', {
        path: req.path,
        errorName: err instanceof Error ? err.name : 'UnknownError',
      });
      res.status(503).json(SERVICIO_NO_DISPONIBLE_BODY);
    }
  });
}
