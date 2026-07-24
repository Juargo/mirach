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
    // Reintento para flakes TRANSITORIOS de supertest: `request(app)` levanta un
    // server efímero en un puerto random por request, y bajo paralelismo de
    // archivos dos pueden colisionar de puerto (síntoma visto: un request
    // enrutado al server de otro spec). No es un bug de código — es una carrera
    // de puertos del SO. Un reintento la absorbe sin serializar la suite ni
    // refactorizar 11 specs a servers persistentes. Un fallo REAL falla los 3
    // intentos igual, así que no enmascara regresiones.
    retry: 2,
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
    },
  },
});
