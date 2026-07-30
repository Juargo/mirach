---
tags:
  - adr
  - fase-diseño
  - toolchain
  - testing
proyecto: MoneyDiary
estado: ✅ Decidido
fecha_creacion: 2026-07-12
fecha_actualizacion: 2026-07-12
---

# ADR-016 — Testing Framework: migración de Jest a Vitest (backend + frontend)

## Estado

✅ **Decidido**

Reemplaza el runner de pruebas definido implícitamente en ADR-001 Backend Framework (Jest, plantilla por defecto de NestJS) y fija el runner del frontend de ADR-008 Frontend Stack, que hasta ahora no lo definía.

---

## Contexto

El plan de pruebas del proyecto (ADR-015 Técnicas de Verificación de Requisitos) exige verificación por capas con énfasis en dinero (tests unitarios de dominio) y control de acceso (tests de integración por `user_id`). Esa estrategia depende de un runner de pruebas rápido, fiable y homogéneo entre `apps/api` y `apps/web`.

**Estado actual del testing:**

- **Backend (`apps/api`)** usa **Jest 30 + ts-jest**. La configuración vive en tres lugares: el bloque `jest` de `apps/api/package.json` (unit, `testRegex: .*\.spec\.ts$`, `testEnvironment: node`), más `test/jest-e2e.json` y `test/jest-integration.json` para las suites que tocan Prisma/Supabase. Scripts: `test`, `test:watch`, `test:cov`, `test:e2e`, `test:integration`. Suites existentes: value objects de dominio, use cases, controllers HTTP y repositorios Prisma.
- **Frontend (`apps/web`)** **no tiene runner de pruebas configurado**. React 19 + Vite 8 + TanStack están montados, pero no hay ni una sola suite. Definir el runner ahora evita heredar la deuda de arrastrar Jest a un proyecto Vite.

**Problemas con Jest en este stack:**

- **Doble toolchain de transpilación.** El proyecto compila con Vite (`apps/web`) y `tsc`/SWC (NestJS), pero los tests corren sobre `ts-jest`, un transformador aparte que hay que mantener y configurar (`transform`, `transformIgnorePatterns` con el hack `node_modules/.pnpm/(?!uuid@)`). Es una fuente de fricción cada vez que se toca ESM o una dep como `uuid`/`exceljs`.
- **ESM y `node_modules/.pnpm`.** El aislamiento no-hoisted de pnpm (ver notas de seguridad del proyecto) obliga a parchear `transformIgnorePatterns`. Vitest usa el pipeline de Vite (esbuild) y maneja ESM de forma nativa, sin ese parche.
- **Incoherencia entre front y back.** Si el frontend adopta Jest necesitaría `babel-jest`/`ts-jest` + `jsdom` configurados a mano, duplicando toolchain frente a un stack que ya es Vite end-to-end.
- **Velocidad.** ts-jest re-typecheckea en cada corrida; Vitest (esbuild, sin type-check en runtime) arranca y re-ejecuta en watch notablemente más rápido, lo que importa para el ciclo TDD que sigue el proyecto.

Esta decisión NO cambia qué se prueba ni la estrategia de ADR-015 Técnicas de Verificación de Requisitos — solo la herramienta que ejecuta las pruebas.

---

## Opciones Evaluadas

### Opción A — Mantener Jest en ambos workspaces

✅ Cero trabajo de migración en backend
✅ Ecosistema maduro, mucha documentación
❌ Segundo toolchain de transpilación (`ts-jest`) además de Vite/tsc
❌ Requiere el hack `transformIgnorePatterns` por el layout de pnpm
❌ En el frontend Vite obliga a configurar `jsdom` + transform a mano
❌ Más lento en watch por el type-check de ts-jest en cada corrida

### Opción B — Jest en backend, Vitest en frontend

✅ Frontend alineado con Vite
❌ **Dos runners distintos** en el mismo monorepo: doble config, doble API de aserciones/mocks, doble curva de aprendizaje
❌ Incoherencia que contradice el objetivo de aprendizaje de buenas prácticas homogéneas

### Opción C — Vitest en ambos workspaces ✅ (elegida)

Runner único basado en el pipeline de Vite, con API compatible con Jest (`describe/it/expect`, `vi` en lugar de `jest`).

✅ **Un solo runner** para `apps/api` y `apps/web` — misma API, mismo estilo de mocks
✅ Soporte ESM nativo vía Vite/esbuild — elimina el hack `transformIgnorePatterns`
✅ Sin toolchain de transpilación extra en el frontend (reusa la config Vite existente)
✅ Watch mode y arranque más rápidos (esbuild, sin type-check en runtime)
✅ API **casi 1:1 con Jest** — migración mecánica, bajo riesgo
✅ `jsdom`/`happy-dom` + `@testing-library/react` listos para el frontend React 19
✅ MIT, activamente mantenido, publicado en npm → cubierto por `pnpm audit` (coherente con ADR-006 Package Manager)
❌ Requiere migrar la config y suites existentes del backend
❌ Comunidad algo menor que Jest (mitigado por la compatibilidad de API)

---

## Decisión

**Runner de pruebas único para todo el monorepo:** `vitest`.

### Backend (`apps/api`)

Reemplazar Jest + ts-jest por Vitest:

- Sustituir el bloque `jest` de `package.json` por un `vitest.config.ts` (entorno `node`, `include: ['src/**/*.spec.ts']`, `globals: true`).
- Migrar `test/jest-e2e.json` y `test/jest-integration.json` a proyectos/config de Vitest (`vitest.e2e.config.ts`, `vitest.int.config.ts`), conservando el gate `ALLOW_DESTRUCTIVE_DB=1`.
- Actualizar imports de mocks: `jest.fn()` → `vi.fn()`, `jest.mock()` → `vi.mock()`, etc.
- Reemplazar devDeps: quitar `jest`, `ts-jest`, `@types/jest`, `eslint-plugin-jest`; añadir `vitest`, `@vitest/coverage-v8` y (si aplica) `eslint-plugin-vitest`.
- Los archivos `*.spec.ts` mantienen su nombre y ubicación; el testRegex se traduce a `include`.

### Frontend (`apps/web`)

Configurar Vitest desde cero (no hay Jest que migrar):

- `vitest.config.ts` integrado con la config de Vite existente, entorno `jsdom` (o `happy-dom`).
- Añadir `vitest`, `@vitest/coverage-v8`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`.
- Setup file con `@testing-library/jest-dom` para las aserciones de DOM.

### Scripts (homogéneos en ambos workspaces)

```jsonc
"test":            "vitest run",
"test:watch":      "vitest",
"test:cov":        "vitest run --coverage",
// solo backend:
"test:e2e":        "ALLOW_DESTRUCTIVE_DB=1 vitest run --config ./vitest.e2e.config.ts",
"test:integration":"ALLOW_DESTRUCTIVE_DB=1 vitest run --config ./vitest.int.config.ts"
```

El `pnpm test` de la raíz (`pnpm -r test`) sigue funcionando sin cambios: delega en el script `test` de cada workspace.

---

## Consecuencias

**Positivas:**

- **Un único runner y una única API de pruebas** en todo el monorepo — menos configuración que mantener y una sola herramienta que aprender, coherente con el objetivo pedagógico del proyecto.
- Se elimina el segundo toolchain de transpilación (`ts-jest`) y el hack `transformIgnorePatterns` ligado al layout no-hoisted de pnpm.
- Ciclo TDD más ágil por el watch y arranque más rápidos (relevante para el énfasis en tests de dominio de dinero de ADR-015 Técnicas de Verificación de Requisitos).
- El frontend nace con testing configurado, evitando arrastrar Jest a un stack Vite.
- Se mantiene la cobertura bajo `pnpm audit` (dependencias en npm), coherente con ADR-006 Package Manager.

**A tener en cuenta:**

- **Migración del backend requiere una pasada por todas las suites** (`*.spec.ts`, e2e, integration) para cambiar `jest.*` → `vi.*` y verificar que todos los tests siguen verdes. Es mecánico pero hay que hacerlo en un PR dedicado (`test: migrar de jest a vitest`), no mezclado con features.
- Verificar que las **suites de integración/e2e con Prisma/Supabase** siguen respetando el gate `ALLOW_DESTRUCTIVE_DB=1` y el aislamiento por `userId` (RNF-SEC-006) tras la migración.
- Ajustar la config de ESLint: quitar `eslint-plugin-jest`, añadir el equivalente de Vitest si se quiere linting de tests.
- Coverage cambia de proveedor (Istanbul de ts-jest → V8): los números pueden variar levemente; recalibrar cualquier umbral si existiera.
- Actualizar la referencia al runner en el `CLAUDE.md` del repo y en `00 Metodología/` si mencionan Jest.

### Criterio de cierre (DoD)

La migración se da por terminada cuando: (1) `pnpm test`, `pnpm api test:e2e` y `pnpm api test:integration` corren en verde con Vitest; (2) no queda ninguna referencia a `jest`/`ts-jest` en `package.json` ni en el árbol de deps; (3) `apps/web` tiene al menos una suite de ejemplo pasando bajo `jsdom`; (4) `pnpm audit` limpio; (5) commit con Conventional Commits.

---

## Referencias

- [Vitest — documentación oficial](https://vitest.dev/)
- [Vitest — guía de migración desde Jest](https://vitest.dev/guide/migration.html)
- [@testing-library/react](https://testing-library.com/docs/react-testing-library/intro/)
- ADR-001 Backend Framework
- ADR-006 Package Manager
- ADR-008 Frontend Stack
- ADR-015 Técnicas de Verificación de Requisitos

---

*Fecha de decisión: 2026-07-12 · Última actualización: 2026-07-12*
