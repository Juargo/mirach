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
    // `test/*.spec.ts` (top-level only, NOT `test/**`) — deliberately
    // disjoint from `test/**/*.int-spec.ts`/`test/**/*.e2e-spec.ts`
    // (own configs, real DB) and from `test/fixtures/`/`test/support/`
    // (no `*.spec.ts` files there). Added for T-01
    // (`preview-rowindex-estable.spec.ts`, design.md D-07) — a unit test
    // with stubbed reader ports, no DB, that reads real fixture bytes
    // from `test/fixtures/`, so it belongs next to them, not under `src/`.
    include: ['src/**/*.spec.ts', 'test/*.spec.ts'],
    // Reintento para flakes TRANSITORIOS de supertest: `request(app)` levanta un
    // server efímero en un puerto random por request, y bajo paralelismo de
    // archivos dos pueden colisionar de puerto (síntoma visto: un request
    // enrutado al server de otro spec). No es un bug de código — es una carrera
    // de puertos del SO. Un reintento la absorbe sin serializar la suite ni
    // refactorizar 11 specs a servers persistentes. Un fallo REAL falla los 3
    // intentos igual, así que no enmascara regresiones.
    retry: 2,
    // CI-safety: un `it.only`/`describe.only` olvidado en un commit no debe
    // poder silenciar el resto de la suite. Vitest ya desactiva `.only` por
    // defecto cuando `process.env.CI` está seteado (`allowOnly` por defecto
    // es `!process.env.CI`) — se fija explícito para no depender de que la
    // variable CI esté presente en todos los runners (gap señalado dos
    // veces en review).
    allowOnly: false,
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
    },
  },
});
