import { OAuth2Client } from 'google-auth-library';

import { Result } from '../../shared/result';
import { VerificacionIdentidadFallidaError } from '../../domain/errors/verificacion-identidad-fallida.error';
import {
  IVerificadorIdTokenExterno,
  IdentidadExterna,
} from '../../application/ports/verificador-identidad-externa.port';

/**
 * Superficie mínima que el adapter usa de `OAuth2Client` (ISP, design §5.2):
 * el double de test implementa UN método, no el cliente entero.
 */
export interface ClienteVerificadorIdToken {
  verifyIdToken(opciones: { idToken: string; audience: string[] }): Promise<{
    getPayload():
      | { sub?: string; email?: string; email_verified?: boolean }
      | undefined;
  }>;
}

/**
 * GoogleIdTokenVerifier — único archivo del repo que importa
 * `google-auth-library` (design §5.1/§5.2). Implementa
 * `IVerificadorIdTokenExterno`, consumido por la ruta
 * `POST /api/auth/google/token` (mobile, ADR-035, AUTH-19).
 *
 * Ninguna excepción de `google-auth-library` cruza el puerto (ADR-005): toda
 * falla — firma inválida, `aud`/`iss` incorrectos, token expirado, o un fallo
 * de red al resolver el JWKS de Google — se envuelve en
 * `Result.fail(new VerificacionIdentidadFallidaError(...))`, indistinguible
 * entre sí (design §5.3, AUTH-21) — la distinción vive solo en el nivel de
 * log, nunca en la respuesta.
 *
 * Un `idToken` vacío/en blanco falla ANTES de invocar el cliente: evita un
 * fetch de JWKS inútil para una request trivialmente inválida.
 *
 * Un único `OAuth2Client` vive en el grafo de composición durante todo el
 * proceso, así que su cache interno de certificados de Google se comparte
 * entre llamadas — no se implementa cache propio.
 */
export class GoogleIdTokenVerifier implements IVerificadorIdTokenExterno {
  constructor(
    private readonly audiencias: readonly string[],
    private readonly cliente: ClienteVerificadorIdToken = new OAuth2Client(),
  ) {}

  async verificarIdToken(
    idToken: string,
  ): Promise<Result<IdentidadExterna, VerificacionIdentidadFallidaError>> {
    if (idToken.trim() === '') {
      return Result.fail(
        new VerificacionIdentidadFallidaError('id-token-vacio'),
      );
    }

    try {
      const ticket = await this.cliente.verifyIdToken({
        idToken,
        audience: [...this.audiencias],
      });
      const payload = ticket.getPayload();

      if (payload === undefined || payload.sub === undefined) {
        return Result.fail(
          new VerificacionIdentidadFallidaError('payload-invalido'),
        );
      }

      return Result.ok({
        sub: payload.sub,
        email: payload.email ?? null,
        emailVerificado: payload.email_verified === true,
      });
    } catch {
      return Result.fail(
        new VerificacionIdentidadFallidaError('verificacion-id-token-fallo'),
      );
    }
  }
}
