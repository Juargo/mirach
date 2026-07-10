/**
 * ICryptoService — port de aplicación.
 *
 * Define el contrato de cifrado/descifrado para campos sensibles de una
 * transacción (por ejemplo, la descripción). Cuando exista una clave de
 * cifrado, NUNCA provendrá de variables de entorno (ver US-011 / diseño).
 *
 * IMPORTANTE: la implementación por defecto (NoOpCryptoService) es identidad
 * (pass-through) — NO cifra nada. El cifrado real está DIFERIDO (task 11.6 /
 * era US-012); ninguna capa debe asumir protección at-rest todavía.
 * fecha/cargo/abono/bucketId permanecen en texto plano y consultables.
 */
export interface ICryptoService {
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
}

/** Token de inyección — las interfaces se borran en runtime. */
export const CRYPTO_SERVICE = 'ICryptoService';
