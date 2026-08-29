import { appLogger } from './app-logger';
import { logDemoGateTrip } from './log-demo-gate-trip';

describe('logDemoGateTrip — observabilidad del gate demo (issue #507, ADR-033)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emite un warn con { path } — nunca montos ni PII (ADR-013)', () => {
    const warnSpy = vi.spyOn(appLogger, 'warn').mockImplementation(() => {});

    logDemoGateTrip('/api/categorias/cat-1');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [message, context] = warnSpy.mock.calls[0];
    expect(String(message)).toContain('DEMO_SOLO_LECTURA');
    expect(context).toEqual({ path: '/api/categorias/cat-1' });
  });

  it('el context nunca lleva más campos que { path } — shape redaction-safe fijo', () => {
    const warnSpy = vi.spyOn(appLogger, 'warn').mockImplementation(() => {});

    logDemoGateTrip('/api/perfil');

    const context = warnSpy.mock.calls[0][1];
    expect(Object.keys(context ?? {})).toEqual(['path']);
  });
});
