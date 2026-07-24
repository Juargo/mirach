import { schedule, type ScheduledTask } from 'node-cron';
import type { DemoCleanupService } from '../http/auth/demo-cleanup.service';

/**
 * Expresión cron de la limpieza diaria de demos (DEMO-CLN-03): 3:00 AM, todos
 * los días. Reemplaza el `@Cron('0 3 * * *')` de Nest que se perdió en el
 * cutover a Express (ADR-028).
 */
export const EXPRESION_LIMPIEZA_DIARIA = '0 3 * * *';

/** Tipo de la función `schedule` de node-cron — inyectable para tests. */
type FuncionSchedule = typeof schedule;

/**
 * programarLimpiezaDemo — agenda la red de seguridad diaria de cuentas demo
 * (ADR-028). Se llama UNA vez en el bootstrap (server.ts) con el
 * `DemoCleanupService` del container.
 *
 * `limpiarDiario()` nunca lanza (try/catch interno), así que el cron no
 * necesita manejo de errores extra. `noOverlap` evita que dos corridas se pisen
 * si una tardara más de un día. `schedule` es inyectable para testear qué se
 * agenda sin depender del reloj real.
 */
export function programarLimpiezaDemo(
  demoCleanup: DemoCleanupService,
  scheduleFn: FuncionSchedule = schedule,
): ScheduledTask {
  return scheduleFn(
    EXPRESION_LIMPIEZA_DIARIA,
    () => demoCleanup.limpiarDiario(),
    { name: 'demo-cleanup-diaria', noOverlap: true },
  );
}
