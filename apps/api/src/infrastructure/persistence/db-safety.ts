/**
 * Guarda de seguridad para operaciones destructivas de base de datos.
 *
 * Los tests de integración (deleteMany, migrate reset) y el seed MUTAN la BD
 * apuntada por DIRECT_URL/DATABASE_URL. Para evitar que un `.env` apuntando a
 * producción sea mutado silenciosamente, estas operaciones exigen un opt-in
 * explícito (ALLOW_DESTRUCTIVE_DB=1) y, como defensa en profundidad, rechazan
 * cadenas de conexión que parezcan de producción.
 */
export interface DestructiveDbOptions {
  connectionString?: string;
}

const PROD_PATTERN = /\bprod\b|production/i;

export function assertDestructiveDbAllowed(
  options?: DestructiveDbOptions,
): void {
  if (process.env.ALLOW_DESTRUCTIVE_DB !== '1') {
    throw new Error(
      'Operación destructiva de BD bloqueada: definí ALLOW_DESTRUCTIVE_DB=1 para ' +
        'habilitar tests de integración/seed contra una BD de desarrollo o test. ' +
        'Nunca apuntes a producción.',
    );
  }

  const connectionString =
    options?.connectionString ??
    process.env.DIRECT_URL ??
    process.env.DATABASE_URL ??
    '';

  if (PROD_PATTERN.test(connectionString)) {
    throw new Error(
      'Operación destructiva de BD bloqueada: la cadena de conexión parece ' +
        'apuntar a producción. Abortando por seguridad.',
    );
  }
}
