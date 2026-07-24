import { defineConfig } from 'vitest/config';

// Suite de integración — repositorios Prisma contra la BD real de desarrollo
// (ADR-016). Tras ADR-028 ya no se necesita SWC ni `reflect-metadata`. Mismo
// setup y gate que la e2e; sin paralelismo entre archivos porque MUTAN tablas
// compartidas.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    root: './',
    include: ['test/**/*.int-spec.ts'],
    setupFiles: ['dotenv/config', './test/integration.setup.ts'],
    testTimeout: 30000,
    fileParallelism: false,
  },
});
