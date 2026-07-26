import { z } from 'zod';

import { SUPABASE_HOST_PATTERN } from '../infrastructure/persistence/db-safety';

/**
 * Validación de entorno tipada y fail-fast (ADR-029).
 *
 * `loadEnv` es una FUNCIÓN — nunca se parsea a nivel de módulo — para que los
 * specs unitarios puedan pasar un `source` propio sin mutar `process.env` ni
 * pagar el costo de un boot real. El boot real (server.ts) llama a
 * `loadEnv()` una única vez, sin argumentos (usa `process.env`).
 *
 * `db-safety.ts` sigue siendo la 2ª capa de defensa en runtime para
 * operaciones destructivas (deleteMany, migrate reset, seed) — este módulo
 * no la reemplaza, solo cierra el hueco de validación de boot.
 */

/**
 * `development`/`test` exigen que la cadena de conexión apunte a un Postgres
 * local — no existe un Supabase de dev/staging separado (ver comentario de
 * `SUPABASE_HOST_PATTERN` en db-safety.ts), así que la única forma segura de
 * no mutar producción por accidente en esos entornos es exigir localhost.
 */
const LOCALHOST_PATTERN = /(^|@|\/\/)(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i;

export const EnvObjectSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development')
    .describe(
      'Entorno de ejecución. Determina las reglas de superRefine: producción exige Supabase + COOKIE_SECURE=true; development/test exigen localhost. El default es development a propósito — si producción lo olvida, la regla de dev (localhost) hace fallar el boot contra Supabase en vez de arrancar inseguro.',
    ),
  PORT: z.coerce
    .number()
    .int()
    .positive()
    .default(3000)
    .describe('Puerto HTTP donde escucha el servidor Express.'),
  DATABASE_URL: z
    .string()
    .min(1)
    .describe(
      'Cadena de conexión Postgres (pooler). Requerida — sin ella el boot falla.',
    ),
  DIRECT_URL: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Cadena de conexión Postgres directa (bypass del pooler), usada por migraciones. Opcional: si falta, se usa DATABASE_URL.',
    ),
  API_KEY: z
    .string()
    .min(16)
    .describe(
      'API key exigida vía header x-api-key en cada request protegido (ADR-015). Mínimo 16 caracteres — el chequeo de longitud se valida acá, en boot, en vez de por request.',
    ),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true')
    .describe(
      'Atributo Secure de la cookie de sesión. Enum de strings ("true"/"false"), NO z.coerce.boolean() — coerce trata cualquier string no vacío (incluido "false") como truthy.',
    ),
  ALLOW_DESTRUCTIVE_DB: z
    .literal('1')
    .optional()
    .describe(
      'Opt-in para operaciones destructivas de BD (tests de integración/seed). Prohibido en producción — ver superRefine.',
    ),
  LOGIN_RATELIMIT_MAX_EMAIL: z.coerce
    .number()
    .int()
    .positive()
    .default(5)
    .describe(
      'Máximo de intentos de login fallidos por email antes de bloquear.',
    ),
  LOGIN_RATELIMIT_MAX_IP: z.coerce
    .number()
    .int()
    .positive()
    .default(20)
    .describe('Máximo de intentos de login fallidos por IP antes de bloquear.'),
  LOGIN_RATELIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(900000)
    .describe('Ventana de tiempo (ms) del rate limiter de login.'),
});

type EnvSource = z.infer<typeof EnvObjectSchema>;

/**
 * Fuente única de la cadena de conexión efectiva: `DIRECT_URL` tiene
 * precedencia sobre `DATABASE_URL` cuando está presente. La usan tanto el
 * `superRefine` de este archivo como `createPrismaClient` (Slice 1) — una
 * sola implementación, no dos regex/ternarios divergentes.
 */
export function resolveConnectionString(
  env: Pick<EnvSource, 'DATABASE_URL' | 'DIRECT_URL'>,
): string {
  return env.DIRECT_URL ?? env.DATABASE_URL;
}

/**
 * Reglas de negocio por `NODE_ENV` (ENV-02/03/04) — separado de
 * `EnvSchema` como función nombrada para que cada regla sea legible sola,
 * sin tener que leerla dentro de la llamada a `superRefine`.
 */
function refineByEnvironment(
  env: EnvSource,
  ctx: z.RefinementCtx<EnvSource>,
): void {
  const conn = resolveConnectionString(env);

  if (env.NODE_ENV === 'production') {
    if (!env.COOKIE_SECURE) {
      ctx.addIssue({
        code: 'custom',
        path: ['COOKIE_SECURE'],
        message: 'En producción COOKIE_SECURE debe ser "true".',
      });
    }

    if (!SUPABASE_HOST_PATTERN.test(conn)) {
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_URL'],
        message: 'En producción la cadena de conexión debe apuntar a Supabase.',
      });
    }

    if (env.ALLOW_DESTRUCTIVE_DB !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['ALLOW_DESTRUCTIVE_DB'],
        message: 'ALLOW_DESTRUCTIVE_DB no puede estar definido en producción.',
      });
    }
  } else if (!LOCALHOST_PATTERN.test(conn)) {
    ctx.addIssue({
      code: 'custom',
      path: ['DATABASE_URL'],
      message: `En ${env.NODE_ENV} la cadena de conexión debe apuntar a localhost.`,
    });
  }
}

export const EnvSchema = EnvObjectSchema.superRefine(refineByEnvironment);

export type Env = Readonly<z.infer<typeof EnvSchema>>;

function formatEnvError(error: z.ZodError): string {
  const lines = error.issues.map(
    (issue) => `  - ${issue.path.join('.')}: ${issue.message}`,
  );
  return `Configuración de entorno inválida:\n${lines.join('\n')}`;
}

/**
 * Parsea y valida el entorno. Nunca devuelve un `Env` parcial: si algo
 * requerido falta o es inválido, lanza sincrónicamente antes de boot.
 *
 * `source` default a `process.env` — pasar un `source` explícito (como
 * hacen los specs) evita mutar variables de entorno globales en tests.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);

  if (!result.success) {
    throw new Error(formatEnvError(result.error));
  }

  return Object.freeze(result.data);
}
