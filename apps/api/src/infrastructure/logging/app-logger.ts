import { createPinoLogger, PinoLogger } from './pino-logger';

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
 * `development`, pretty. `LOG_LEVEL` (ADR-033 slice A) ya pasó por
 * `loadEnv()`/Zod en el boot real antes de que este módulo se evalúe — acá
 * solo se relee crudo con el MISMO default ('info') que el schema aplicaría,
 * consistente con el resto de este archivo (nunca importa `config/env.ts`).
 */
export const appLogger: PinoLogger = createPinoLogger({
  pretty: process.env.NODE_ENV === 'development',
  level: process.env.LOG_LEVEL ?? 'info',
});
