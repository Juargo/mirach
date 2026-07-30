/**
 * ICryptoService — port de aplicación.
 *
 * Define el contrato de cifrado/descifrado para campos sensibles de una
 * transacción (por ejemplo, la descripción).
 *
 * La implementación de producción por defecto es `AesGcmCryptoService`
 * (AES-256-GCM, ver `aes-gcm-crypto.service.ts`), no identidad. La clave de
 * 32 bytes proviene de la variable de entorno `ENCRYPTION_KEY` (secreto en
 * el dashboard de Render, `sync:false` — ver CLAUDE.md "Notas de
 * seguridad"). Esto es una decisión ACEPTADA, no un descuido: dado el
 * topology actual (PaaS free tier mono-usuario, ADR-023), guardar la clave
 * en env protege contra el robo de un dump/backup de la BD, pero NO contra
 * un atacante con acceso al dashboard de Render (esa amenaza requeriría un
 * KMS separado, diferido — YAGNI para este topology). `NoOpCryptoService`
 * (identidad, pass-through) sigue existiendo para tests/fixtures que no
 * necesitan ejercitar cifrado real.
 */
export interface ICryptoService {
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
}

/** Token de inyección — las interfaces se borran en runtime. */
export const CRYPTO_SERVICE = 'ICryptoService';
