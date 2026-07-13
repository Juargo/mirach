import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Runner de pruebas unitarias del backend — reemplaza a Jest (ADR-016).
//
// NestJS resuelve la inyección de dependencias leyendo la metadata de tipos
// que emiten los decoradores (`emitDecoratorMetadata`). esbuild — el
// transformador por defecto de Vite/Vitest — NO emite esa metadata, así que el
// DI de Nest (p. ej. `Test.createTestingModule`) se rompería. SWC sí la emite:
// por eso los tests del backend se transforman con `unplugin-swc` en vez de
// esbuild. Es el camino soportado para NestJS + Vitest.
export default defineConfig({
  // Vitest 4 transforma con Oxc por defecto; se desactiva para que el ÚNICO
  // transformador sea SWC (unplugin-swc) — el que emite la metadata de
  // decoradores que NestJS necesita. Evita la doble transformación.
  oxc: false,
  test: {
    globals: true,
    environment: 'node',
    root: './',
    include: ['src/**/*.spec.ts'],
    setupFiles: ['./test/vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
    },
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
