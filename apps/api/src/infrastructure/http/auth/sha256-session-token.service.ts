import { randomBytes, createHash } from 'node:crypto';
import {
  ISessionTokenService,
  TokenGenerado,
} from '../../../application/ports/session-token.port';

/**
 * Sha256SessionTokenService — implementación de `ISessionTokenService` (AUTH-04).
 *
 * El token opaco es 32 bytes aleatorios codificados en base64url. Solo su
 * SHA-256 se persiste (`Session.tokenHash`) — SHA-256 basta porque el token
 * ya es un secreto de 256 bits, no una contraseña de baja entropía; no hace
 * falta argon2 para el lookup.
 */
export class Sha256SessionTokenService implements ISessionTokenService {
  generar(): TokenGenerado {
    const token = randomBytes(32).toString('base64url');
    return { token, tokenHash: this.hashToken(token) };
  }

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
