/**
 * Identificadores fijos del MVP mono-usuario (US-011).
 *
 * Son constantes de infraestructura, NUNCA variables de entorno. El seed
 * idempotente depende de que estos valores permanezcan estables entre
 * ejecuciones para garantizar upserts sin duplicados.
 */
export const USER_ID_FIJO = 'usuario-fijo-moneydiary';
export const ACCOUNT_ID_FIJO = 'cuenta-fija-moneydiary';

/**
 * DI injection token for the fixed mono-user userId.
 * Using a typed constant instead of a bare string literal prevents silent
 * mismatches between @Inject(...) and the module provider declaration.
 */
export const USER_ID_FIJO_TOKEN = 'USER_ID_FIJO';
