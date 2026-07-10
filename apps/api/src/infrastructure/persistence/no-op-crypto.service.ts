import { ICryptoService } from '../../application/ports/crypto-service.port';

/**
 * NoOpCryptoService — implementación identidad del port ICryptoService.
 *
 * Pass-through: no cifra ni descifra. Es el default del MVP (US-011);
 * el cifrado real de columnas queda fuera de alcance (NON-Goal del spec).
 */
export class NoOpCryptoService implements ICryptoService {
  encrypt(plaintext: string): string {
    return plaintext;
  }

  decrypt(ciphertext: string): string {
    return ciphertext;
  }
}
