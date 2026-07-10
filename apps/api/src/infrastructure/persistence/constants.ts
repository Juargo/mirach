/**
 * Identificadores fijos del MVP mono-usuario (US-011).
 *
 * Son constantes de infraestructura, NUNCA variables de entorno. El seed
 * idempotente depende de que estos valores permanezcan estables entre
 * ejecuciones para garantizar upserts sin duplicados.
 */
export const USER_ID_FIJO = 'usuario-fijo-moneydiary';
export const ACCOUNT_ID_FIJO = 'cuenta-fija-moneydiary';
