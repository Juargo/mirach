import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Suite de integración — repositorios Prisma contra la BD real de desarrollo
// (ADR-016, migración de `test/jest-integration.json`). Mismo setup y gate que
// la e2e; sin paralelismo entre archivos porque MUTAN tablas compartidas.
export default defineConfig({
  // Ver vitest.config.ts: SWC como único transformador (metadata de decoradores).
  oxc: false,
  test: {
    globals: true,
    environment: 'node',
    root: './',
    include: ['test/**/*.int-spec.ts'],
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
