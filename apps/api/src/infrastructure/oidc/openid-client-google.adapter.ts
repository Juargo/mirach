import {
  discovery,
  buildAuthorizationUrl,
  authorizationCodeGrant,
  randomPKCECodeVerifier,
  calculatePKCECodeChallenge,
  randomState,
  randomNonce,
  type Configuration,
} from 'openid-client';

import { Result } from '../../shared/result';
import { VerificacionIdentidadFallidaError } from '../../domain/errors/verificacion-identidad-fallida.error';
import {
  IIniciadorLoginExterno,
  IVerificadorIdentidadExterna,
  InicioAutorizacion,
  IdentidadExterna,
  ParametrosCallback,
} from '../../application/ports/verificador-identidad-externa.port';

/** Issuer de Google — discovery document en `<issuer>/.well-known/openid-configuration`. */
const GOOGLE_ISSUER = new URL('https://accounts.google.com');

/**
 * OpenIdClientGoogleAdapter — único archivo del repo que importa `openid-client`
 * (design §4.2). Implementa ambos roles (`IIniciadorLoginExterno` +
 * `IVerificadorIdentidadExterna`, ISP §4.1) sobre el mismo cliente OIDC.
 *
 * Discovery es LAZY y memoizada (no en boot — `createContainer` es síncrono y
 * no puede depender de que Google esté disponible). El memo cachea la
 * PROMISE, no el valor resuelto, y se limpia en rechazo (`.catch`) para que
 * una falla transitoria (DNS, timeout) no envenene el adapter para el resto
 * del proceso — el siguiente intento reintenta discovery desde cero.
 *
 * Ninguno de los dos métodos deja cruzar una excepción cruda de
 * `openid-client` a través del puerto (ADR-005/repo convention): todo error
 * se envuelve en `Result.fail(new VerificacionIdentidadFallidaError(...))`.
 * `motivo` es texto libre fijo por caso, nunca el error crudo ni valores de
 * `code`/`state`/`id_token` (AUTH-18).
 */
export class OpenIdClientGoogleAdapter
  implements IIniciadorLoginExterno, IVerificadorIdentidadExterna
{
  private configuracion: Promise<Configuration> | undefined;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly redirectUri: string,
  ) {}

  private obtenerConfiguracion(): Promise<Configuration> {
    if (this.configuracion === undefined) {
      this.configuracion = discovery(
        GOOGLE_ISSUER,
        this.clientId,
        this.clientSecret,
      ).catch((error: unknown) => {
        // Memo envenenado limpiado ANTES de re-lanzar: el próximo llamador
        // reintenta discovery desde cero en vez de heredar esta promise ya
        // rechazada para siempre.
        this.configuracion = undefined;
        throw error;
      });
    }
    return this.configuracion;
  }

  async iniciar(): Promise<
    Result<InicioAutorizacion, VerificacionIdentidadFallidaError>
  > {
    try {
      const config = await this.obtenerConfiguracion();
      const codeVerifier = randomPKCECodeVerifier();
      const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);
      const state = randomState();
      const nonce = randomNonce();

      const url = buildAuthorizationUrl(config, {
        redirect_uri: this.redirectUri,
        scope: 'openid email',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        state,
        nonce,
      });

      return Result.ok({
        urlAutorizacion: url.toString(),
        state,
        nonce,
        codeVerifier,
      });
    } catch {
      return Result.fail(
        new VerificacionIdentidadFallidaError('inicio-oidc-fallo'),
      );
    }
  }

  async verificar(
    p: ParametrosCallback,
  ): Promise<Result<IdentidadExterna, VerificacionIdentidadFallidaError>> {
    try {
      const config = await this.obtenerConfiguracion();
      const tokens = await authorizationCodeGrant(
        config,
        new URL(p.urlCallback),
        {
          pkceCodeVerifier: p.codeVerifier,
          expectedState: p.state,
          expectedNonce: p.nonce,
        },
      );

      const claims = tokens.claims();

      if (claims === undefined) {
        return Result.fail(
          new VerificacionIdentidadFallidaError('id-token-ausente'),
        );
      }

      // Coalescing fail-closed (4R carry-forward): un claim opcional AUSENTE
      // (no solo `undefined`) debe resolver al valor seguro — nunca al
      // truthiness laxo de un valor no chequeado.
      return Result.ok({
        sub: claims.sub,
        email: (claims.email as string | undefined) ?? null,
        emailVerificado:
          (claims.email_verified as boolean | undefined) ?? false,
      });
    } catch {
      return Result.fail(
        new VerificacionIdentidadFallidaError('intercambio-oidc-fallo'),
      );
    }
  }
}
