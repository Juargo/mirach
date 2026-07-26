import type { z } from 'zod';

import { EnvObjectSchema } from './env';

/**
 * Emisor de `.env.example` derivado de `EnvObjectSchema` (ADR-029, Slice 6).
 *
 * Todo este módulo es PURO — sin `fs`/`process` — para que sea testeable con
 * `pnpm api test` como cualquier otro caso de uso. El wrapper con I/O real
 * (leer/escribir el archivo, `--check`, exit codes) vive en
 * `scripts/gen-env-example.ts`, que solo importa `renderEnvExample` y
 * `envExampleDiverges` de acá.
 *
 * Decisión (KISS, ver tarea 6.5 / prompt de aplicación): el schema NO incluye
 * las variables solo-de-script (`SEED_USER_EMAIL`, `SEED_USER_PASSWORD`,
 * `CONFIRM_PROD_BACKFILL`) — el boot de la API no las necesita (ver
 * design.md, decisión resuelta #3). En vez de dejarlas completamente fuera
 * de `.env.example`, se documentan en un bloque final FIJO (hardcodeado acá,
 * no editado a mano en el archivo generado) para que sigan siendo
 * descubribles sin volver el schema deshonesto sobre lo que exige el boot.
 */

const HEADER = [
  '# === MoneyDiary API — variables de entorno ===',
  '# GENERADO desde src/config/env.ts (EnvObjectSchema) por `pnpm api env:example`.',
  '# NO editar a mano: los cambios se pierden en la próxima corrida.',
  '# Para agregar/cambiar una variable, editar el schema y volver a generar.',
].join('\n');

const SCRIPT_ONLY_VARS_TRAILER = [
  '',
  '# === Variables solo-de-script (fuera de EnvObjectSchema — ver ADR-029) ===',
  '# `loadEnv()` NO las valida: el boot de la API no las necesita. Las usan',
  '# scripts standalone (seed, backfill) con su propio guard de seguridad.',
  '# SEED_USER_EMAIL=              # prisma/seed.ts — email del usuario semilla',
  '# SEED_USER_PASSWORD=           # prisma/seed.ts — password del usuario semilla',
  '# CONFIRM_PROD_BACKFILL=        # prisma/backfill-categorias.ts — ack explícito para correr contra producción',
].join('\n');

/**
 * Camina la cadena de wrappers de Zod (`optional`/`nullable`/`pipe`) hasta
 * encontrar un nodo `default` y devuelve su valor CRUDO (pre-transform) como
 * string. `undefined` si el campo no tiene default (requerido, u opcional
 * sin default).
 *
 * El caso pipe existe por `COOKIE_SECURE`: `enum().default().transform()`
 * compila a `{ type: 'pipe', in: <default>, out: <transform> }` en zod@4 — el
 * default vive en el lado `in`, no en el nodo externo.
 */
function extractDefaultValue(schema: z.ZodTypeAny): string | undefined {
  let current: z.ZodTypeAny | undefined = schema;

  while (current) {
    const def = current.def as {
      type: string;
      innerType?: z.ZodTypeAny;
      in?: z.ZodTypeAny;
      defaultValue?: unknown;
    };

    if (def.type === 'default') {
      return String(def.defaultValue);
    }
    if (def.type === 'optional' || def.type === 'nullable') {
      current = def.innerType;
      continue;
    }
    if (def.type === 'pipe') {
      current = def.in;
      continue;
    }
    break;
  }

  return undefined;
}

/**
 * Formatea un único campo como línea `.env.example`:
 * `KEY=default  # description` (o `KEY=  # description` si no hay default).
 */
export function formatFieldLine(name: string, schema: z.ZodTypeAny): string {
  const description = schema.description ?? '';
  const defaultValue = extractDefaultValue(schema);
  const value = defaultValue ?? '';

  return `${name}=${value}  # ${description}`;
}

/**
 * Genera el contenido completo de `.env.example`: una línea por campo de
 * `EnvObjectSchema` (en orden de declaración) + el bloque fijo de variables
 * solo-de-script. Determinístico: misma entrada, mismo texto siempre.
 */
export function renderEnvExample(
  schema: typeof EnvObjectSchema = EnvObjectSchema,
): string {
  const lines = Object.entries(schema.shape).map(([name, fieldSchema]) =>
    formatFieldLine(name, fieldSchema as z.ZodTypeAny),
  );

  return `${HEADER}\n\n${lines.join('\n')}\n${SCRIPT_ONLY_VARS_TRAILER}\n`;
}

/**
 * `true` si `committedContent` (el `.env.example` tal como está en el repo)
 * NO coincide con lo que el schema actual generaría — la lógica pura detrás
 * del exit code de `env:example:check` (CI falla en divergencia).
 */
export function envExampleDiverges(
  committedContent: string,
  schema: typeof EnvObjectSchema = EnvObjectSchema,
): boolean {
  return committedContent !== renderEnvExample(schema);
}
