import type { Env } from '../config/env';
import type { IClienteAppleAuth } from '../application/ports/cliente-apple-auth.port';
import type { ILogger } from '../application/ports/logger.port';

import { AppleAuthHttpClient } from '../infrastructure/identity/apple-auth-http.client';
import { AppleClientSecretSigner } from '../infrastructure/identity/apple-client-secret.signer';

type EnvApple = Partial<
  Pick<
    Env,
    'APPLE_BUNDLE_ID' | 'APPLE_TEAM_ID' | 'APPLE_KEY_ID' | 'APPLE_PRIVATE_KEY'
  >
>;

const vacia = (v: string | undefined): boolean =>
  v === undefined || v.trim() === '';

/**
 * crearClienteAppleAuth — arma el cliente de la API REST de Apple (canje del
 * authorizationCode + revocación) o `undefined` si el intercambio y la
 * revocación quedan apagados. El API arranca igual: es un opcional, nunca un
 * fail-fast. Emite UNA línea al arrancar: `info` si está habilitado o apagado
 * a propósito, `warn` si la config está a medias o la clave no es un PEM EC
 * válido (nombra las variables, jamás sus valores). `client_id` es el bundle
 * ID (`APPLE_BUNDLE_ID`, ya existente).
 */
export function crearClienteAppleAuth(
  env: EnvApple,
  logger: ILogger,
): IClienteAppleAuth | undefined {
  const credenciales = {
    APPLE_TEAM_ID: env.APPLE_TEAM_ID,
    APPLE_KEY_ID: env.APPLE_KEY_ID,
    APPLE_PRIVATE_KEY: env.APPLE_PRIVATE_KEY,
  };
  const sinCredenciales = Object.values(credenciales).every(vacia);

  if (vacia(env.APPLE_BUNDLE_ID) && sinCredenciales) {
    return undefined;
  }

  if (sinCredenciales) {
    logger.info(
      'apple-rest: sin APPLE_TEAM_ID/APPLE_KEY_ID/APPLE_PRIVATE_KEY — canje del authorizationCode y revocación deshabilitados',
    );
    return undefined;
  }

  const faltantes = [
    ...(vacia(env.APPLE_BUNDLE_ID) ? ['APPLE_BUNDLE_ID'] : []),
    ...Object.entries(credenciales)
      .filter(([, valor]) => vacia(valor))
      .map(([nombre]) => nombre),
  ];

  if (faltantes.length > 0) {
    logger.warn(
      'apple-rest: configuración incompleta — canje del authorizationCode y revocación deshabilitados',
      { faltantes },
    );
    return undefined;
  }

  try {
    const signer = new AppleClientSecretSigner({
      teamId: env.APPLE_TEAM_ID as string,
      keyId: env.APPLE_KEY_ID as string,
      clientId: env.APPLE_BUNDLE_ID as string,
      privateKeyPem: env.APPLE_PRIVATE_KEY as string,
    });
    logger.info(
      'apple-rest: canje del authorizationCode y revocación habilitados',
    );
    return new AppleAuthHttpClient(env.APPLE_BUNDLE_ID as string, signer);
  } catch {
    logger.warn(
      'apple-rest: APPLE_PRIVATE_KEY inválida — canje del authorizationCode y revocación deshabilitados',
    );
    return undefined;
  }
}
