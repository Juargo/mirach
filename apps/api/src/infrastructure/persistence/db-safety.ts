/**
 * Guarda de seguridad para operaciones destructivas de base de datos.
 *
 * Los tests de integración (deleteMany, migrate reset) y el seed MUTAN la BD
 * apuntada por DIRECT_URL/DATABASE_URL. Para evitar que un `.env` apuntando a
 * producción sea mutado silenciosamente, estas operaciones exigen un opt-in
 * explícito (ALLOW_DESTRUCTIVE_DB=1) y, como defensa en profundidad, rechazan
 * cadenas de conexión que parezcan de producción.
 *
 * `allowProductionAck` es una excepción angosta y explícita a esa defensa en
 * profundidad, para operaciones supervisadas que SÍ deben poder correr una
 * vez contra producción (ej. el backfill de categorías de US-013). Es
 * opt-in por *llamador* — el seed y los int-specs no lo pasan y por lo tanto
 * siguen rechazando producción exactamente como antes.
 */
export interface DestructiveDbOptions {
  connectionString?: string;
  /**
   * Habilita, SOLO para esta llamada, correr contra una cadena de conexión
   * detectada como producción — si y solo si `process.env[envVar]` es
   * EXACTAMENTE igual a `expected` (además de ALLOW_DESTRUCTIVE_DB=1, que
   * sigue siendo obligatorio). Si no se pasa este campo, el comportamiento
   * es idéntico al de siempre: producción se rechaza sin excepción.
   */
  allowProductionAck?: {
    /** Nombre del env var de confirmación (ej. 'CONFIRM_PROD_BACKFILL'). */
    envVar: string;
    /** Valor exacto que debe tener ese env var para habilitar el opt-in. */
    expected: string;
    /** Nombre legible de la operación, para el warning y el log. */
    operation: string;
  };
}

const PROD_PATTERN = /\bprod\b|production/i;

/**
 * MoneyDiary tiene un único proyecto Supabase (`cpudmeahqjiuvpqvvizg`), y ESE
 * proyecto ES producción — no existe un Supabase de dev/staging separado.
 * La cadena de conexión real (pooler `*.pooler.supabase.com` o directa
 * `db.<ref>.supabase.co`) no contiene "prod" ni "production", así que
 * `PROD_PATTERN` por sí solo nunca la detecta. Tratamos CUALQUIER host
 * Supabase como producción (belt-and-suspenders junto a `PROD_PATTERN`).
 * Local/test sigue siendo un Postgres desechable en localhost, no Supabase,
 * así que esta regla no lo afecta. Si algún día se introduce un proyecto
 * Supabase de dev/branch separado, esta regla debe revisarse.
 */
const SUPABASE_HOST_PATTERN = /supabase\.co(m)?/i;

function looksLikeProduction(connectionString: string): boolean {
  return (
    PROD_PATTERN.test(connectionString) ||
    SUPABASE_HOST_PATTERN.test(connectionString)
  );
}

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

  if (looksLikeProduction(connectionString)) {
    const ack = options?.allowProductionAck;
    if (ack && process.env[ack.envVar] === ack.expected) {
      console.warn(
        `⚠️  PRODUCTION DESTRUCTIVE OP ACK'd: ${ack.operation} — running against production. ` +
          `(confirmed via ${ack.envVar})`,
      );
      return;
    }

    throw new Error(
      'Operación destructiva de BD bloqueada: la cadena de conexión parece ' +
        'apuntar a producción. Abortando por seguridad.',
    );
  }
}
