import { programarLimpiezaDemo, EXPRESION_LIMPIEZA_DIARIA } from './demo-cleanup-scheduler';
import type { DemoCleanupService } from '../http/auth/demo-cleanup.service';

/**
 * Reemplazo del `@Cron` de Nest (ADR-028): el scheduling se testea con un doble
 * de `schedule` (node-cron) — se verifica QUÉ se agenda y que la tarea invoque
 * `limpiarDiario()`, sin depender del reloj real.
 */
describe('programarLimpiezaDemo', () => {
  it('agenda limpiarDiario con la expresión diaria (3 AM), sin solapamiento', () => {
    const scheduleFn = vi.fn();
    const demoCleanup = { limpiarDiario: vi.fn() } as unknown as DemoCleanupService;

    programarLimpiezaDemo(demoCleanup, scheduleFn as never);

    expect(scheduleFn).toHaveBeenCalledWith(
      EXPRESION_LIMPIEZA_DIARIA,
      expect.any(Function),
      expect.objectContaining({ noOverlap: true }),
    );
  });

  it('la tarea agendada invoca limpiarDiario()', () => {
    let tarea: () => unknown = () => undefined;
    const scheduleFn = vi.fn((_expr: string, fn: () => unknown) => {
      tarea = fn;
    });
    const demoCleanup = {
      limpiarDiario: vi.fn().mockResolvedValue(undefined),
    } as unknown as DemoCleanupService;

    programarLimpiezaDemo(demoCleanup, scheduleFn as never);
    tarea();

    expect(demoCleanup.limpiarDiario).toHaveBeenCalledOnce();
  });
});
