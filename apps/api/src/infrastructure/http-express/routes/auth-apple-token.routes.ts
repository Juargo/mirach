import type { Router } from 'express';
import type { IVerificadorIdTokenApple } from '../../../application/ports/verificador-identidad-apple.port';
import type { LoginConAppleUseCase } from '../../../application/use-cases/login-con-apple.use-case';
import type { IpRateLimiter } from '../../http/auth/ip-rate-limiter';
import { getClientIp } from '../../http/auth/client-ip';
import { appLogger } from '../../logging/app-logger';
import { CredencialesInvalidasError } from '../../../domain/errors/credenciales-invalidas.error';
import { authAppleTokenRequestSchema } from '../schemas/auth-apple-token.schema';

/**
 * Cuerpo 401 genérico — derivado de `CredencialesInvalidasError`, la misma
 * fuente que `/auth/login` y `/auth/google/token`, para que sea byte-idéntico
 * por construcción. El mismo cuerpo para TODA causa de fallo (no enumeración).
 */
const GENERIC_401_BODY = { message: new CredencialesInvalidasError().message };

const RATE_LIMITED_BODY = {
  message: 'Demasiadas solicitudes. Intenta más tarde.',
};

/** Dependencias de `POST /api/auth/apple/token` — mismo shape que `AppleAuthGraph` (composition). */
export interface AuthAppleTokenDeps {
  readonly verificadorIdToken: IVerificadorIdTokenApple;
  readonly loginConApple: LoginConAppleUseCase;
  readonly appleTokenRateLimiter: IpRateLimiter;
}

/**
 * registrarAuthAppleToken — `POST /api/auth/apple/token`. Verifica el identity
 * token nativo de Sign in with Apple (incluido el nonce) y resuelve la
 * identidad con `LoginConAppleUseCase`: por `sub`, por email real
 * verificado, o creando la cuenta. Responde `{ token, userId, expiresAt }`
 * para usar como Bearer; sin `Set-Cookie`.
 *
 * Rate limiter (mismo patrón que Google mobile): `recordFailure` optimista
 * antes de verificar y `reset(ip)` SOLO para el login de un usuario
 * pre-existente; un alta nunca resetea, así un IP no crea cuentas sin límite.
 * El body 200 es idéntico para ambos casos (`esNuevoUsuario` no se serializa).
 *
 * Un body JSON bien formado pero inválido NO es 400: toma el 401 genérico,
 * igual que un fallo de verificación. Un JSON sintácticamente malformado no
 * llega al handler: lo rechaza `express.json()` y responde el
 * `errorMiddleware` compartido (500 genérico). Todo throw inesperado de un colaborador también. El
 * log distingue la causa (`.warn` + `motivo` para fallos modelados, `.error` +
 * `errorName` para excepciones) pero nunca incluye el token, el nonce, el
 * nombre, el email ni el `sub`.
 */
export function registrarAuthAppleToken(
  router: Router,
  deps: AuthAppleTokenDeps,
): void {
  const { verificadorIdToken, loginConApple, appleTokenRateLimiter } = deps;

  router.post('/auth/apple/token', async (req, res) => {
    try {
      const ip = getClientIp(req);
      if (appleTokenRateLimiter.isBlocked(ip)) {
        appLogger.warn('Apple token rechazado (rate-limited)', {
          path: req.path,
        });
        res.status(429).json(RATE_LIMITED_BODY);
        return;
      }
      appleTokenRateLimiter.recordFailure(ip);

      const body = authAppleTokenRequestSchema.safeParse(req.body);

      if (!body.success) {
        appLogger.warn('Apple token rechazado (body inválido)', {
          path: req.path,
        });
        res.status(401).json(GENERIC_401_BODY);
        return;
      }

      const { identityToken, nonce, nombre } = body.data;

      const verificacion = await verificadorIdToken.verificarIdToken(
        identityToken,
        nonce,
      );

      if (verificacion.isFail()) {
        appLogger.warn(
          'Apple token rechazado (verificación del identity token falló)',
          { path: req.path, motivo: verificacion.getError().motivo },
        );
        res.status(401).json(GENERIC_401_BODY);
        return;
      }

      const resultado = await loginConApple.execute(
        verificacion.getValue(),
        nombre,
      );

      if (resultado.isFail()) {
        appLogger.warn(
          'Apple token rechazado (resolución de identidad falló)',
          { path: req.path, motivo: resultado.getError().motivo },
        );
        res.status(401).json(GENERIC_401_BODY);
        return;
      }

      const { token, userId, expiresAt, esNuevoUsuario } = resultado.getValue();

      if (!esNuevoUsuario) {
        appleTokenRateLimiter.reset(ip);
      }

      res
        .status(200)
        .json({ token, userId, expiresAt: expiresAt.toISOString() });
    } catch (err) {
      appLogger.error('Apple token rechazado (fallo inesperado)', {
        path: req.path,
        errorName: err instanceof Error ? err.name : 'UnknownError',
      });
      res.status(401).json(GENERIC_401_BODY);
    }
  });
}

/**
 * registrarAuthAppleTokenDeshabilitado — stub 404 cuando
 * `container.appleAuth === undefined`. Genuinamente requerido: una ruta no
 * montada caería en `protectedApi`, cuyo `sessionMiddleware` respondería 401.
 */
export function registrarAuthAppleTokenDeshabilitado(router: Router): void {
  router.post('/auth/apple/token', (_req, res) => {
    res.status(404).end();
  });
}
