import { createPrivateKey, type KeyObject } from 'node:crypto';
import { SignJWT } from 'jose';

export const APPLE_AUDIENCE = 'https://appleid.apple.com';

/**
 * Vida del client secret. Apple admite hasta 6 meses; se firma uno corto
 * porque exchange y revoke son infrecuentes y un secreto de vida corta limita
 * el daño de una filtración en logs/memoria.
 */
export const CLIENT_SECRET_LIFETIME_SECONDS = 3600;

/** Se firma uno nuevo cuando faltan menos de estos segundos para expirar. */
export const CLIENT_SECRET_REFRESH_MARGIN_SECONDS = 300;

export interface ConfigClientSecretApple {
  /** Team ID de la cuenta Apple Developer (claim `iss`). */
  readonly teamId: string;
  /** Key ID de la clave `.p8` (header `kid`). */
  readonly keyId: string;
  /** Bundle ID de la app (`client_id`, claim `sub`). */
  readonly clientId: string;
  /** Contenido PEM (PKCS8) de la `.p8`; admite `\n` literales. */
  readonly privateKeyPem: string;
}

/** Fuente del client secret — lo que consume el cliente HTTP de Apple. */
export interface IProveedorClientSecretApple {
  obtener(): Promise<string>;
}

/**
 * Los dashboards de env suelen guardar el PEM en una línea con `\n`
 * literales; se restauran los saltos reales antes de importar la clave.
 */
export function normalizarPemApple(pem: string): string {
  return pem.replace(/\\n/g, '\n').trim();
}

/**
 * AppleClientSecretSigner — arma el `client_secret` de Sign in with Apple: un
 * JWT ES256 (header `kid` = Key ID; claims `iss` = Team ID, `iat`, `exp`,
 * `aud` = https://appleid.apple.com, `sub` = client_id).
 *
 * Importa la clave en el constructor (falla rápido ante un PEM inválido, sin
 * incluir el valor en el mensaje) y cachea el JWT hasta
 * `CLIENT_SECRET_REFRESH_MARGIN_SECONDS` antes de su expiración.
 */
export class AppleClientSecretSigner implements IProveedorClientSecretApple {
  private readonly clave: KeyObject;
  private cache: { jwt: string; refrescarDesdeMs: number } | null = null;

  constructor(
    private readonly config: ConfigClientSecretApple,
    private readonly ahora: () => Date = () => new Date(),
  ) {
    try {
      this.clave = createPrivateKey({
        key: normalizarPemApple(config.privateKeyPem),
        format: 'pem',
      });
    } catch {
      throw new Error('APPLE_PRIVATE_KEY no es un PEM de clave privada válido');
    }

    if (this.clave.asymmetricKeyType !== 'ec') {
      throw new Error('APPLE_PRIVATE_KEY no es una clave EC (ES256)');
    }
  }

  async obtener(): Promise<string> {
    const ahoraMs = this.ahora().getTime();

    if (this.cache !== null && ahoraMs < this.cache.refrescarDesdeMs) {
      return this.cache.jwt;
    }

    const iat = Math.floor(ahoraMs / 1000);
    const exp = iat + CLIENT_SECRET_LIFETIME_SECONDS;
    const jwt = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: this.config.keyId })
      .setIssuer(this.config.teamId)
      .setSubject(this.config.clientId)
      .setAudience(APPLE_AUDIENCE)
      .setIssuedAt(iat)
      .setExpirationTime(exp)
      .sign(this.clave);

    this.cache = {
      jwt,
      refrescarDesdeMs: (exp - CLIENT_SECRET_REFRESH_MARGIN_SECONDS) * 1000,
    };
    return jwt;
  }
}
