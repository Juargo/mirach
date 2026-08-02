/**
 * IBlindIndexService — port de aplicación (US-035).
 *
 * Índice ciego (blind index) determinístico para permitir búsquedas de
 * IGUALDAD exacta sobre un campo cifrado en reposo (`User.email`, ADR-013):
 * `PrismaUserCredentialRepository.buscarPorEmail` no puede hacer
 * `WHERE email = <valor>` contra ciphertext (AES-GCM es no-determinístico —
 * IV aleatorio por valor, ver aes-gcm-crypto.service.ts), así que el login
 * consulta por `emailBlindIndex` (HMAC determinístico del email normalizado)
 * en vez de por `email`.
 *
 * Separado de `ICryptoService` a propósito (ISP, ver skill `solid`): cifrar
 * y computar un índice de búsqueda son responsabilidades distintas — un
 * consumidor que solo necesita buscar (ej. un futuro índice sobre otro
 * campo) no debería depender de encrypt/decrypt, y viceversa.
 *
 * La implementación de producción es `HmacBlindIndexService` (HMAC-SHA256,
 * ver hmac-blind-index.service.ts). La clave HMAC se deriva vía HKDF a
 * partir de `ENCRYPTION_KEY` — ver `composition/derive-blind-index-key.ts`
 * (la derivación vive en el composition root, no en el adapter, mismo
 * patrón que `AesGcmCryptoService` recibe su clave ya decodificada).
 */
export interface IBlindIndexService {
  compute(value: string): string;
}

/** Token de inyección — las interfaces se borran en runtime. */
export const BLIND_INDEX_SERVICE = 'IBlindIndexService';
