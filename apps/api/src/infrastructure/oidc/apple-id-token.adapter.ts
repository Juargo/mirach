import { createHash, timingSafeEqual } from 'node:crypto';
import {
  createRemoteJWKSet,
  errors,
  jwtVerify,
  type JWTVerifyGetKey,
} from 'jose';

import { Result } from '../../shared/result';
import { VerificacionIdentidadFallidaError } from '../../domain/errors/verificacion-identidad-fallida.error';
import {
  IVerificadorIdTokenApple,
  IVerificadorSubCanjeApple,
  IdentidadApple,
} from '../../application/ports/verificador-identidad-apple.port';

export const APPLE_ISSUER = 'https://appleid.apple.com';
export const APPLE_JWKS_URL = new URL('https://appleid.apple.com/auth/keys');

/** Deadline del fetch del JWKS: una caída de Apple debe ser un 401, no una request colgada. */
export const APPLE_JWKS_TIMEOUT_MS = 5_000;

/** Dominio de los emails "Ocultar mi correo" de Apple. */
const DOMINIO_RELAY_PRIVADO = '@privaterelay.appleid.com';

/**
 * AppleIdTokenVerifier — único archivo que verifica el identity token de
 * Sign in with Apple. Implementa `IVerificadorIdTokenApple`.
 *
 * Valida contra el JWKS de Apple (clave elegida por `kid`): firma RS256 (el
 * algoritmo se fija, nunca el del header), `iss` = Apple, `aud` = bundle ID de
 * la app (flujo nativo iOS) y `exp`.
 *
 * Nonce: la app genera un nonce crudo, le pasa a Apple su SHA-256 en hex
 * (`ASAuthorizationAppleIDRequest.nonce`) y Apple lo copia TAL CUAL al claim
 * `nonce` del token — es el patrón documentado por Apple/Firebase. Al servidor
 * llega el nonce CRUDO; se hashea acá y se compara con el claim. Solo se
 * acepta la forma hasheada: aceptar también el claim igual al crudo debilitaría
 * la prueba (un cliente que ya envía el hash lo enviaría como "crudo"). Un
 * token sin claim `nonce`, o un nonce vacío, falla: sin nonce no hay defensa
 * contra el replay de un identity token capturado.
 *
 * `email_verified` e `is_private_email` pueden llegar como boolean o como
 * string ("true"/"false"). Nada de la librería JWT cruza el puerto (ADR-005):
 * toda falla es `Result.fail`, indistinguible hacia afuera; el `motivo` lleva
 * solo el código de error de jose, nunca el token ni valores de claims.
 */
export class AppleIdTokenVerifier
  implements IVerificadorIdTokenApple, IVerificadorSubCanjeApple
{
  constructor(
    private readonly bundleId: string,
    private readonly claves: JWTVerifyGetKey = createRemoteJWKSet(
      APPLE_JWKS_URL,
      { timeoutDuration: APPLE_JWKS_TIMEOUT_MS },
    ),
    private readonly ahora: () => Date = () => new Date(),
  ) {}

  async verificarIdToken(
    idToken: string,
    nonce: string,
  ): Promise<Result<IdentidadApple, VerificacionIdentidadFallidaError>> {
    if (idToken.trim() === '') {
      return fallo('id-token-vacio');
    }
    if (nonce.trim() === '') {
      return fallo('nonce-vacio');
    }

    try {
      const { payload } = await jwtVerify(idToken, this.claves, {
        issuer: APPLE_ISSUER,
        audience: this.bundleId,
        algorithms: ['RS256'],
        currentDate: this.ahora(),
      });

      if (typeof payload.sub !== 'string' || payload.sub === '') {
        return fallo('payload-invalido');
      }
      if (!nonceCoincide(payload.nonce, nonce)) {
        return fallo('nonce-invalido');
      }

      const email = typeof payload.email === 'string' ? payload.email : null;

      return Result.ok({
        sub: payload.sub,
        email,
        emailVerificado: esVerdadero(payload.email_verified),
        emailPrivado:
          esVerdadero(payload.is_private_email) ||
          (email?.toLowerCase().endsWith(DOMINIO_RELAY_PRIVADO) ?? false),
      });
    } catch (error) {
      return fallo(
        error instanceof errors.JOSEError
          ? `jwt-${error.code}`
          : 'verificacion-id-token-fallo',
      );
    }
  }
  /**
   * `id_token` del canje de `/auth/token`: misma verificación criptográfica
   * (RS256 fijo, JWKS, `iss`, `aud`, `exp`) pero sin nonce. Retorna el `sub`.
   */
  async verificarSubDelCanje(
    idToken: string,
  ): Promise<Result<string, VerificacionIdentidadFallidaError>> {
    if (idToken.trim() === '') {
      return fallo('id-token-vacio');
    }

    try {
      const { payload } = await jwtVerify(idToken, this.claves, {
        issuer: APPLE_ISSUER,
        audience: this.bundleId,
        algorithms: ['RS256'],
        currentDate: this.ahora(),
      });

      return typeof payload.sub === 'string' && payload.sub !== ''
        ? Result.ok(payload.sub)
        : fallo('payload-invalido');
    } catch (error) {
      return fallo(
        error instanceof errors.JOSEError
          ? `jwt-${error.code}`
          : 'verificacion-id-token-fallo',
      );
    }
  }
}

function fallo(
  motivo: string,
): Result<never, VerificacionIdentidadFallidaError> {
  return Result.fail(new VerificacionIdentidadFallidaError(motivo));
}

/** Apple serializa los flags como boolean o como string "true"/"false". */
function esVerdadero(valor: unknown): boolean {
  return valor === true || valor === 'true';
}

/** SHA-256 hex del nonce crudo contra el claim, en tiempo constante. */
function nonceCoincide(claim: unknown, nonceCrudo: string): boolean {
  if (typeof claim !== 'string') return false;

  const esperado = Buffer.from(
    createHash('sha256').update(nonceCrudo).digest('hex'),
  );
  const recibido = Buffer.from(claim.toLowerCase());

  return (
    esperado.length === recibido.length && timingSafeEqual(esperado, recibido)
  );
}
