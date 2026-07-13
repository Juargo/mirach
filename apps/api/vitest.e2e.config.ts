import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Suite e2e — HTTP contra la BD real de desarrollo (ADR-016, migración de
// `test/jest-e2e.json`). Mismo motivo que `vitest.config.ts` para usar SWC:
// el `AppModule` completo depende de la metadata de decoradores para el DI.
//
// `setupFiles` en orden: reflect-metadata → dotenv (carga apps/api/.env) →
// integration.setup (gate `ALLOW_DESTRUCTIVE_DB=1`, RNF-SEC). Sin paralelismo
// entre archivos: estas suites MUTAN tablas compartidas.
export default defineConfig({
  // Ver vitest.config.ts: SWC como único transformador (metadata de decoradores).
  oxc: false,
  test: {
    globals: true,
    environment: 'node',
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    setupFiles: [
      'reflect-metadata',
      'dotenv/config',
      './test/integration.setup.ts',
    ],
    testTimeout: 30000,
    fileParallelism: false,
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        target: 'es2021',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
});
