import { createPinoLogger, PinoLogger } from './pino-logger';

/** Mismo enum que `LOG_LEVEL` en `config/env.ts` (Zod) — duplicado a propósito
 * porque este módulo nunca importa `config/env.ts` (ver comentario abajo). */
const PINO_LEVELS = new Set([
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
]);

/**
 * readSafeLogLevel — lee `process.env.LOG_LEVEL` crudo pero NUNCA deja pasar
 * un valor que Pino no reconozca: si falta o no está en `PINO_LEVELS`, cae a
 * `'info'` en silencio. Ver el comentario de `appLogger` para el motivo (el
 * orden real de evaluación de imports).
 */
function readSafeLogLevel(): string {
  const raw = process.env.LOG_LEVEL;
  return raw !== undefined && PINO_LEVELS.has(raw) ? raw : 'info';
}

/**
 * appLogger — instancia singleton de `PinoLogger` para sitios de
 * infraestructura (middleware, rutas, servicios) que hoy no reciben `ILogger`
 * vía DI de constructor y para los que introducir esa DI en esta slice
 * ampliaría demasiado el blast radius (ADR-033 slice 2, YAGNI: el pipeline de
 * ingesta SÍ lo recibe por constructor porque ya tenía DI de ports; el resto
 * de la infraestructura HTTP usa `console.*` directo hoy, así que este
 * singleton es el reemplazo mínimo y simple).
 *
 * `pretty` y `level` se deciden leyendo `process.env` directamente — igual
 * precedente que `db-safety.ts` (lee `process.env` fuera de `config/env.ts`
 * porque es una 2ª capa de defensa/infra de bajo nivel, no una regla de
 * negocio). En `production`/`test`/no-seteado sale JSON a stdout; en
 * `development`, pretty.
 *
 * Orden real de evaluación (el motivo de `readSafeLogLevel`): este módulo
 * vive en el import graph de consumidores de infra (middleware, rutas) que
 * Node requiere ANTES de que el boot real llame a `loadEnv()` — los imports
 * se evalúan primero, top-down. Si este módulo leyera `process.env.LOG_LEVEL`
 * crudo y se lo pasara directo a Pino, un valor inválido haría que Pino
 * lanzara SU PROPIO error al importar este archivo — un stack trace opaco de
 * Pino, no el fail-fast documentado de Zod (ADR-029). `readSafeLogLevel()`
 * evita ese throw a nivel de módulo saneando el valor contra el mismo set de
 * niveles que Pino acepta, con el mismo default `'info'` del schema. Con eso,
 * importar este módulo nunca falla, y `loadEnv()` — que SÍ corre después, en
 * el boot real — es quien efectivamente rechaza un `LOG_LEVEL` inválido, con
 * el mensaje limpio y con nombre de campo que Zod produce.
 */
export const appLogger: PinoLogger = createPinoLogger({
  pretty: process.env.NODE_ENV === 'development',
  level: readSafeLogLevel(),
});
