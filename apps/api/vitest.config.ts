import { defineConfig } from 'vitest/config';

// Runner de pruebas unitarias del backend (ADR-016). Tras el cutover a Express
// (ADR-028) ya no hay decoradores en el código, así que se usa el transformador
// por defecto de Vitest (Oxc) — se quitaron `unplugin-swc` y el polyfill
// `reflect-metadata` que NestJS requería para la metadata de decoradores.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    root: './',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
    },
  },
});
