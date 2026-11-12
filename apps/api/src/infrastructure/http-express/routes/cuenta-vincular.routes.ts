import type { Request, Response, Router } from 'express';
import type { IVerificadorIdTokenApple } from '../../../application/ports/verificador-identidad-apple.port';
import type { IVerificadorIdTokenExterno } from '../../../application/ports/verificador-identidad-externa.port';
import type { LoginConAppleUseCase } from '../../../application/use-cases/login-con-apple.use-case';
import type {
  IdentidadAVincular,
  VincularIdentidadUseCase,
} from '../../../application/use-cases/vincular-identidad.use-case';
import type { VerificacionIdentidadFallidaError } from '../../../domain/errors/verificacion-identidad-fallida.error';
import type { IpRateLimiter } from '../../http/auth/ip-rate-limiter';
import { getClientIp } from '../../http/auth/client-ip';
import { appLogger } from '../../logging/app-logger';
import { SERVICIO_NO_DISPONIBLE_BODY } from '../auth-error-codes';
import {
  CUENTA_NO_ANONIMA,
  CUENTA_YA_EXISTE,
  IDENTIDAD_INVALIDA,
  cuentaVincularAppleRequestSchema,
  cuentaVincularGoogleRequestSchema,
} from '../schemas/cuenta-anonima.schema';

const RATE_LIMITED_BODY = {
  message: 'Demasiadas solicitudes. Intenta más tarde.',
};

const BODY_INVALIDO = {
  message: 'Cuerpo de la petición inválido.',
  code: 'BODY_INVALIDO',
};

const IDENTIDAD_INVALIDA_BODY = {
  message: 'No pudimos verificar esa cuenta.',
  code: IDENTIDAD_INVALIDA,
};

const CODIGO_409 = {
  'cuenta-ya-existe': CUENTA_YA_EXISTE,
  'cuenta-no-anonima': CUENTA_NO_ANONIMA,
} as const;

export interface CuentaVincularDeps {
  readonly vincularIdentidad: VincularIdentidadUseCase;
  readonly vincularRateLimiter: IpRateLimiter;
  /** `undefined` cuando Sign in with Apple no está configurado: la ruta responde 404. */
  readonly apple?: {
    readonly verificadorIdToken: IVerificadorIdTokenApple;
    readonly loginConApple: Pick<
      LoginConAppleUseCase,
      'programarGuardadoRefreshToken'
    >;
  };
  /** `undefined` cuando Google para apps nativas no está configurado: 404. */
  readonly google?: {
    readonly verificadorIdToken: IVerificadorIdTokenExterno;
  };
}

/**
 * registrarCuentaVincular — `POST /api/cuenta/vincular/apple` y
 * `POST /api/cuenta/vincular/google` (ADR-013). Rutas protegidas: el usuario
 * es SIEMPRE `req.userId`, nunca un valor del body.
 *
 * Un token de Apple o Google que no verifica responde 400
 * `IDENTIDAD_INVALIDA`, NO 401: en una ruta con sesión un 401 significa
 * "sesión inválida" y la app cerraría la sesión, lo que para una cuenta
 * anónima es perder los datos.
 *
 * Nunca se loguea el token, el nonce, el authorizationCode, el nombre, el
 * email ni el `sub`.
 */
export function registrarCuentaVincular(
  router: Router,
  deps: CuentaVincularDeps,
): void {
  const { vincularIdentidad, vincularRateLimiter, apple, google } = deps;

  /** Pasos comunes después de verificar la identidad. `true` si vinculó. */
  async function vincular(
    req: Request,
    res: Response,
    ip: string,
    identidad: IdentidadAVincular,
    nombre: string | null,
  ): Promise<boolean> {
    const resultado = await vincularIdentidad.execute({
      userId: req.userId!,
      tokenHashActual: req.sessionTokenHash ?? '',
      identidad,
      nombre,
    });

    if (resultado.isFail()) {
      const error = resultado.getError();
      appLogger.warn('Vinculación rechazada', {
        path: req.path,
        motivo: error.motivo,
      });
      res
        .status(409)
        .json({ message: error.message, code: CODIGO_409[error.motivo] });
      return false;
    }

    vincularRateLimiter.reset(ip);
    const { token, userId, expiresAt } = resultado.getValue();
    res.status(200).json({ token, userId, expiresAt: expiresAt.toISOString() });
    return true;
  }

  /** `undefined` si la IP está bloqueada (ya respondió 429). */
  function ipConPresupuesto(req: Request, res: Response): string | undefined {
    const ip = getClientIp(req);
    if (vincularRateLimiter.isBlocked(ip)) {
      appLogger.warn('Vinculación rechazada (rate-limited)', {
        path: req.path,
      });
      res.status(429).json(RATE_LIMITED_BODY);
      return undefined;
    }
    vincularRateLimiter.recordFailure(ip);
    return ip;
  }

  function responderVerificacionFallida(
    req: Request,
    res: Response,
    error: VerificacionIdentidadFallidaError,
  ): void {
    appLogger.warn('Vinculación rechazada (verificación del token falló)', {
      path: req.path,
      motivo: error.motivo,
    });
    if (error.proveedorCaido) {
      res.status(503).json(SERVICIO_NO_DISPONIBLE_BODY);
      return;
    }
    res.status(400).json(IDENTIDAD_INVALIDA_BODY);
  }

  function responderFalloInesperado(
    req: Request,
    res: Response,
    err: unknown,
  ): void {
    appLogger.error('Vinculación rechazada (fallo inesperado)', {
      path: req.path,
      errorName: err instanceof Error ? err.name : 'UnknownError',
    });
    res.status(503).json(SERVICIO_NO_DISPONIBLE_BODY);
  }

  router.post('/cuenta/vincular/apple', async (req, res) => {
    if (apple === undefined) {
      res.status(404).end();
      return;
    }

    try {
      const ip = ipConPresupuesto(req, res);
      if (ip === undefined) {
        return;
      }

      const body = cuentaVincularAppleRequestSchema.safeParse(req.body);
      if (!body.success) {
        res.status(400).json(BODY_INVALIDO);
        return;
      }

      const { identityToken, nonce, nombre, authorizationCode } = body.data;
      const verificacion = await apple.verificadorIdToken.verificarIdToken(
        identityToken,
        nonce,
      );

      if (verificacion.isFail()) {
        responderVerificacionFallida(req, res, verificacion.getError());
        return;
      }

      const identidad = verificacion.getValue();
      const vinculada = await vincular(
        req,
        res,
        ip,
        {
          proveedor: 'apple',
          sub: identidad.sub,
          email: identidad.email,
          emailVerificado: identidad.emailVerificado,
          emailPrivado: identidad.emailPrivado,
        },
        nombre ?? null,
      );

      if (vinculada) {
        // Mismo guardado best-effort que el inicio de sesión: permite revocar
        // el token de Apple al eliminar la cuenta.
        apple.loginConApple.programarGuardadoRefreshToken(
          req.userId!,
          identidad.sub,
          authorizationCode,
        );
      }
    } catch (err) {
      responderFalloInesperado(req, res, err);
    }
  });

  router.post('/cuenta/vincular/google', async (req, res) => {
    if (google === undefined) {
      res.status(404).end();
      return;
    }

    try {
      const ip = ipConPresupuesto(req, res);
      if (ip === undefined) {
        return;
      }

      const body = cuentaVincularGoogleRequestSchema.safeParse(req.body);
      if (!body.success) {
        res.status(400).json(BODY_INVALIDO);
        return;
      }

      const verificacion = await google.verificadorIdToken.verificarIdToken(
        body.data.idToken,
      );

      if (verificacion.isFail()) {
        responderVerificacionFallida(req, res, verificacion.getError());
        return;
      }

      const identidad = verificacion.getValue();
      await vincular(
        req,
        res,
        ip,
        {
          proveedor: 'google',
          sub: identidad.sub,
          email: identidad.email,
          emailVerificado: identidad.emailVerificado,
          emailPrivado: false,
        },
        null,
      );
    } catch (err) {
      responderFalloInesperado(req, res, err);
    }
  });
}
