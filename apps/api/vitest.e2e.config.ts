import { defineConfig } from 'vitest/config';

// Suite e2e — HTTP contra la BD real de desarrollo (ADR-016). Tras ADR-028
// arranca la app Express (`createApp`) en vez del `AppModule` de Nest, así que
// ya no se necesita SWC ni `reflect-metadata`.
//
// `setupFiles` en orden: dotenv (carga apps/api/.env) → integration.setup
// (gate `ALLOW_DESTRUCTIVE_DB=1`, RNF-SEC). Sin paralelismo entre archivos:
// estas suites MUTAN tablas compartidas.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    setupFiles: ['dotenv/config', './test/integration.setup.ts'],
    testTimeout: 30000,
    fileParallelism: false,
  },
});
