import { afterEach, vi } from 'vitest';

// ──────────────────────────────────────────────────────────────────────────────
// Unit test — app-logger.ts (fail-fast ordering, see comment in el módulo).
// ──────────────────────────────────────────────────────────────────────────────

describe('appLogger — LOG_LEVEL sanitization at import time', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('un LOG_LEVEL inválido NO lanza al importar el módulo (readSafeLogLevel sanea antes de Pino)', async () => {
    vi.stubEnv('LOG_LEVEL', 'bogus-level-que-no-existe');
    vi.resetModules();

    await expect(import('./app-logger.js')).resolves.not.toThrow();
  });

  it('un LOG_LEVEL inválido cae en silencio a "info" (el default del schema Zod real)', async () => {
    vi.stubEnv('LOG_LEVEL', 'bogus-level-que-no-existe');
    vi.resetModules();

    const { appLogger } = await import('./app-logger.js');

    expect(appLogger.raw.level).toBe('info');
  });

  it('LOG_LEVEL ausente también cae a "info"', async () => {
    vi.stubEnv('LOG_LEVEL', undefined);
    vi.resetModules();

    const { appLogger } = await import('./app-logger.js');

    expect(appLogger.raw.level).toBe('info');
  });

  it('un LOG_LEVEL válido (ej. "debug") se respeta tal cual', async () => {
    vi.stubEnv('LOG_LEVEL', 'debug');
    vi.resetModules();

    const { appLogger } = await import('./app-logger.js');

    expect(appLogger.raw.level).toBe('debug');
  });
});
