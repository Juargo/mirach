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

/**
 * `true` si `value` es base64 estándar bien formado (charset + padding) que
 * decodifica a EXACTAMENTE 32 bytes (AES-256). `Buffer.from(str, 'base64')`
 * por sí solo es demasiado permisivo — ignora caracteres inválidos en vez de
 * rechazarlos — así que primero se valida el charset con regex.
 */
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Pathname donde `auth-google.routes.ts` monta el callback (design §8) —
 * única fuente de verdad para la assertion de boot Y para el default local
 * de abajo, así ninguno de los dos puede desincronizarse del otro.
 */
export const GOOGLE_CALLBACK_PATHNAME = '/api/auth/google/callback';

/**
 * Default de `GOOGLE_REDIRECT_URI` para development/test (§8) — mismo host
 * que el dev server de Vite (`CORS_ALLOWED_ORIGINS` default). NUNCA se aplica
 * en producción: ver `withGoogleRedirectUriDefault`.
 */
const DEFAULT_GOOGLE_REDIRECT_URI = `http://localhost:5173${GOOGLE_CALLBACK_PATHNAME}`;

export function isValid32ByteBase64Key(value: string): boolean {
  if (!BASE64_PATTERN.test(value) || value.length % 4 !== 0) {
    return false;
  }
  return Buffer.from(value, 'base64').length === 32;
}

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
  ENCRYPTION_KEY: z
    .string()
    .refine(isValid32ByteBase64Key, {
      message:
        'ENCRYPTION_KEY debe ser un string base64 que decodifique a exactamente 32 bytes (AES-256, ADR-013). Generar con: openssl rand -base64 32',
    })
    .describe(
      'Clave AES-256-GCM para cifrar/descifrar Transaccion.descripcion (ADR-013). Base64 de 32 bytes exactos. Requerida en todo ambiente — igual que API_KEY, sin ella el boot falla. Generar con: openssl rand -base64 32',
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
  CORS_ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    )
    .describe(
      'Orígenes de navegador permitidos para CORS, separados por coma. Es una ALLOWLIST — nunca "*": CORS no protege la API (eso lo hacen api-key/sesión), solo autoriza a un origen distinto a LEER la respuesta. Default: el dev server del web (http://localhost:5173). En producción se setea al origen del web desplegado vía el dashboard de Render.',
    ),
  GOOGLE_CLIENT_ID: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Client ID de OAuth 2.0 de Google (auth-google-login, ADR-034). Opcional: activación por presencia — ver GOOGLE_CLIENT_SECRET. Ausente = feature apagada (kill switch código-cero, design §4.5/§8).',
    ),
  GOOGLE_CLIENT_SECRET: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Client secret de OAuth 2.0 de Google. Regla all-or-nothing con GOOGLE_CLIENT_ID (superRefine): exactamente una de las dos presente falla el boot — un cliente OAuth a medio configurar nunca es un apagado silencioso.',
    ),
  // `z.string()` (no `z.url()`): la validez de la URL la valida enteramente
  // `refineGoogleAuthEnv` con un mensaje accionable. Un `z.url()` acá agregaría
  // una segunda línea de error genérica ("Invalid URL") sobre el mismo campo
  // ante un valor vacío/malformado, duplicando el diagnóstico (4R SUGGESTION).
  GOOGLE_REDIRECT_URI: z
    .string()
    .optional()
    .describe(
      `URL absoluta del callback de Google (${GOOGLE_CALLBACK_PATHNAME}). Requerida (https) en producción cuando el feature está activo; en development/test, si falta, se completa con http://localhost:5173${GOOGLE_CALLBACK_PATHNAME}. El pathname DEBE ser exactamente ${GOOGLE_CALLBACK_PATHNAME} (assertion de boot, design §8) — no protege contra un mismatch con lo registrado en Google Cloud Console, eso se verifica manualmente (§11.4).`,
    ),
  GOOGLE_CLIENT_ID_ANDROID: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Client ID de OAuth 2.0 (tipo Android) de Google para el login mobile nativo (auth-google-login-mobile, ADR-035). Opcional: activación por presencia, gate TOTALMENTE independiente del par GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET (AUTH-22) — ausente = feature mobile apagada (kill switch código-cero, design §7).',
    ),
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

  refineGoogleAuthEnv(env, ctx);
  refineGoogleAuthMobileEnv(env, ctx);
}

/**
 * Reglas de `auth-google-login` (ADR-034, design §8) — separadas de
 * `refineByEnvironment` por legibilidad, misma razón que esa función ya
 * documenta para sí misma.
 *
 * Activación por presencia: `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` son el
 * ÚNICO gate (AUTH-16) — `GOOGLE_REDIRECT_URI` es una regla de
 * buena-forma de la configuración YA activa, nunca un tercer switch.
 */
function refineGoogleAuthEnv(
  env: EnvSource,
  ctx: z.RefinementCtx<EnvSource>,
): void {
  const clientIdPresente = env.GOOGLE_CLIENT_ID !== undefined;
  const clientSecretPresente = env.GOOGLE_CLIENT_SECRET !== undefined;

  if (clientIdPresente !== clientSecretPresente) {
    ctx.addIssue({
      code: 'custom',
      path: ['GOOGLE_CLIENT_ID'],
      message:
        'GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET deben estar ambas presentes o ambas ausentes (all-or-nothing) — un cliente OAuth a medio configurar no es un apagado silencioso.',
    });
    return;
  }

  const googleActivo = clientIdPresente && clientSecretPresente;

  if (!googleActivo) {
    return;
  }

  if (env.GOOGLE_REDIRECT_URI === undefined) {
    // En development/test esto nunca dispara: `loadEnv` completa el default
    // ANTES de parsear (`withGoogleRedirectUriDefault`). Si llegamos acá con
    // el feature activo y sin URI, es producción sin configurar.
    ctx.addIssue({
      code: 'custom',
      path: ['GOOGLE_REDIRECT_URI'],
      message:
        'GOOGLE_REDIRECT_URI es requerida en producción cuando Google login está activo (GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET presentes).',
    });
    return;
  }

  // `new URL(...)` lanza un `TypeError` crudo (no un `ZodError`) ante un
  // string malformado o vacío — `z.url()` a nivel de campo NO evita que
  // `superRefine` reciba igualmente el valor crudo inválido (Zod 4 sigue
  // corriendo `superRefine` aunque un campo ya haya fallado su propio
  // schema). Sin este guard, ese `TypeError` escapa `safeParse` entero y
  // bypassea `formatEnvError` — el boot muere con un mensaje no accionable
  // en vez de listar qué variable está mal y qué se esperaba (4R CRITICAL).
  let redirectUri: URL;
  try {
    redirectUri = new URL(env.GOOGLE_REDIRECT_URI);
  } catch {
    ctx.addIssue({
      code: 'custom',
      path: ['GOOGLE_REDIRECT_URI'],
      message: `GOOGLE_REDIRECT_URI ("${env.GOOGLE_REDIRECT_URI}") no es una URL absoluta válida. Se espera algo como https://<host>${GOOGLE_CALLBACK_PATHNAME} (en producción) o ${DEFAULT_GOOGLE_REDIRECT_URI} (en development/test).`,
    });
    return;
  }

  if (env.NODE_ENV === 'production' && redirectUri.protocol !== 'https:') {
    ctx.addIssue({
      code: 'custom',
      path: ['GOOGLE_REDIRECT_URI'],
      message: 'En producción GOOGLE_REDIRECT_URI debe ser https.',
    });
    return;
  }

  if (redirectUri.pathname !== GOOGLE_CALLBACK_PATHNAME) {
    ctx.addIssue({
      code: 'custom',
      path: ['GOOGLE_REDIRECT_URI'],
      message: `GOOGLE_REDIRECT_URI tiene el pathname "${redirectUri.pathname}", pero la ruta de callback está montada en "${GOOGLE_CALLBACK_PATHNAME}". Deben coincidir exactamente o todo login con Google fallará.`,
    });
  }
}

/**
 * Suffix esperado de un Android OAuth 2.0 client ID de Google. Formato de
 * negocio, no de plataforma — Zod no tiene un validador para esto.
 */
const GOOGLE_ANDROID_CLIENT_ID_SUFFIX = '.apps.googleusercontent.com';

/**
 * Reglas de `auth-google-login-mobile` (ADR-035, design §7) — sibling de
 * `refineGoogleAuthEnv`, NO fusionada en ella: son dos gates de activación
 * TOTALMENTE independientes (AUTH-22) sobre variables distintas; fusionarlas
 * en una sola función obligaría a leer condicionales de dos features
 * entrelazadas para entender cualquiera de las dos (KISS — la duplicación
 * estructural de "misma forma, distinto dato" es más legible que una función
 * gigante con ramas cruzadas).
 *
 * Con UNA sola variable no existe un "par" que exigir all-or-none (a
 * diferencia de GOOGLE_CLIENT_ID/SECRET) — el equivalente de "fail-fast ante
 * una config a medias" es una VALIDACIÓN DE FORMATO: si está presente, debe
 * *parecer* un Android client ID real, no un secret o un valor pegado por
 * error. Un string solo-espacios pasa `min(1)` pero produciría una audiencia
 * vacía/no-identificable en `GoogleIdTokenVerifier` (carry-over 4R de A1) —
 * por eso el `trim()` explícito, no solo el suffix check.
 */
function refineGoogleAuthMobileEnv(
  env: EnvSource,
  ctx: z.RefinementCtx<EnvSource>,
): void {
  const clientIdAndroid = env.GOOGLE_CLIENT_ID_ANDROID;

  if (clientIdAndroid === undefined) {
    return;
  }

  if (
    clientIdAndroid.trim() === '' ||
    !clientIdAndroid.endsWith(GOOGLE_ANDROID_CLIENT_ID_SUFFIX)
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['GOOGLE_CLIENT_ID_ANDROID'],
      message: `GOOGLE_CLIENT_ID_ANDROID ("${clientIdAndroid}") no tiene forma de Android OAuth client ID de Google — se espera que termine en "${GOOGLE_ANDROID_CLIENT_ID_SUFFIX}". Confirmar que no se pegó un client secret o un valor truncado por error.`,
    });
    return;
  }

  if (clientIdAndroid === env.GOOGLE_CLIENT_ID) {
    ctx.addIssue({
      code: 'custom',
      path: ['GOOGLE_CLIENT_ID_ANDROID'],
      message:
        'GOOGLE_CLIENT_ID_ANDROID es idéntico a GOOGLE_CLIENT_ID (el client web) — probable copy-paste. Esto ensancharía en silencio la audiencia aceptada por el verificador de id_token mobile al client web (design §7 punto 3). Usar el Android OAuth client ID real.',
    });
  }
}

/**
 * Completa `GOOGLE_REDIRECT_URI` con el default local ANTES de parsear
 * (design §8) — nunca en producción, donde la ausencia debe fallar el boot
 * (`refineGoogleAuthEnv`). Lee `NODE_ENV` del `source` crudo con el MISMO
 * default ('development') que el propio schema aplicaría, porque este paso
 * corre antes de que Zod exista para aplicarlo.
 */
function withGoogleRedirectUriDefault(
  source: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const nodeEnv = source.NODE_ENV ?? 'development';
  const ambasCredencialesPresentes =
    source.GOOGLE_CLIENT_ID !== undefined &&
    source.GOOGLE_CLIENT_SECRET !== undefined;

  if (
    nodeEnv !== 'production' &&
    ambasCredencialesPresentes &&
    source.GOOGLE_REDIRECT_URI === undefined
  ) {
    return { ...source, GOOGLE_REDIRECT_URI: DEFAULT_GOOGLE_REDIRECT_URI };
  }

  return source;
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
  const result = EnvSchema.safeParse(withGoogleRedirectUriDefault(source));

  if (!result.success) {
    throw new Error(formatEnvError(result.error));
  }

  return Object.freeze(result.data);
}
