---
tags:
  - adr
  - fase-diseño
  - toolchain
  - testing
  - mobile
proyecto: MoneyDiary
estado: ✅ Decidido
fecha_creacion: 2026-07-12
fecha_actualizacion: 2026-07-12
---

# ADR-017 — Testing Mobile: Jest (jest-expo) + React Native Testing Library + Maestro (E2E)

## Estado

✅ **Decidido** — alcance **post-MVP** (se construye junto con `apps/mobile`). Cierra el pendiente "Testing mobile" que ADR-010 App Mobile había dejado como decisión futura, y fija el correlato mobile del stack de testing web (ADR-016 Testing Framework Vitest).

---

## Contexto

El stack de testing **web** quedó fijado en Vitest + Testing Library + Playwright (E2E) (ADR-016 Testing Framework Vitest). Al planificar la app mobile (ADR-010 App Mobile: React Native + Expo dev-client + Expo Router + NativeWind) surge la pregunta natural de si ese mismo stack se reutiliza en `apps/mobile`.

La respuesta es **no directamente**: el tooling de React Native tiene restricciones que impiden copiar el stack web tal cual.

**Por qué el stack web no cruza 1:1 a React Native (verificado, julio 2026):**

- **El runner.** El ecosistema RN/Expo asume **Jest**: Expo publica y mantiene el preset oficial `jest-expo`, que resuelve la transpilación de RN, el mapeo de módulos nativos y los mocks de plataforma. Vitest en RN solo existe como camino comunitario/beta (`vitest-native`), que corre ~85% de un template Expo típico y aún requiere mocks manuales del boundary nativo. Apoyar la verificación de una app financiera sobre un runner beta no es aceptable.
- **Playwright no aplica a nativo.** Playwright automatiza navegadores; no puede manejar apps nativas iOS/Android. El E2E mobile necesita una herramienta específica que hable con el simulador/emulador o el dispositivo.
- **Testing Library sí cruza.** `@testing-library/react` (web) y **React Native Testing Library** (RNTL) comparten filosofía y API (`render`, `screen`, queries por rol/texto, `user-event`). El conocimiento transfiere aunque el paquete sea distinto.

**Alcance del ADR-016 Testing Framework Vitest:** su objetivo de "runner único" está acotado explícitamente al monorepo `apps/api` + `apps/web`. `apps/mobile` es una app aparte (post-MVP) y no forma parte de esa homogeneidad. La divergencia de runner entre web (Vitest) y mobile (Jest) es un costo asumido, mitigado porque la API de aserciones/mocks es casi idéntica (`describe/it/expect`; `vi.*` ↔ `jest.*`) y Testing Library es transversal.

Esta decisión no cambia **qué** se prueba ni la estrategia de ADR-015 Técnicas de Verificación de Requisitos — solo fija las herramientas del app mobile.

---

## Opciones Evaluadas

### Runner de unit + componentes

#### Opción A — Vitest + `vitest-native` + RNTL (consistencia con web)

✅ Un solo runner conceptual en todo el repo (web + mobile)
✅ Reusa el estilo de tests del ADR-016 Testing Framework Vitest
❌ `vitest-native` es **beta**: ~85% de tests pasan en un template Expo típico, requiere mocks manuales del boundary nativo
❌ Fuera del camino soportado por Expo — sin garantías ante subidas de Expo SDK / RN
❌ Riesgo desproporcionado para verificar lógica de dinero en un TFM

#### Opción B — Jest + `jest-expo` + React Native Testing Library ✅ (elegida)

✅ **Camino oficial de Expo** — `jest-expo` es preset mantenido por el propio equipo de Expo
✅ Resuelve transpilación RN, module mapping y mocks nativos sin configuración frágil
✅ **RNTL** es el estándar de facto para componentes RN y comparte API con la Testing Library del web
✅ Robusto ante actualizaciones de Expo SDK (el preset se versiona con el SDK)
✅ Un solo ecosistema npm/pnpm → cubierto por `pnpm audit` (ADR-006 Package Manager)
❌ Runner distinto del web (Jest vs Vitest) — divergencia mitigada por API casi idéntica

### Framework E2E

#### Opción C — Playwright (reusar el del web)

❌ **No soporta apps nativas** — solo navegadores. Descartado de plano para el target mobile.

#### Opción D — Detox

✅ Gray-box específico de RN: sincroniza con el hilo JS y reduce flakiness por timing
✅ Tests en TypeScript
❌ Setup pesado (build nativo, config de dispositivos), más mantenimiento y más flaky en CI
❌ Migración/curva estimada en 2–3 semanas por su modelo gray-box — desproporcionado para el MVP mobile de un solo dev

#### Opción E — Maestro ✅ (elegida)

✅ **Recomendado oficialmente por Expo** (desde Expo v2.1.0)
✅ Flujos declarativos en **YAML** legibles como acciones de usuario — sin locator strategy ni driver
✅ Sin build pipeline propio; CI típico de ~8–12 min
✅ Bajo mantenimiento y baja barrera de entrada (cualquiera que lea YAML escribe un flujo)
❌ Menos control gray-box que Detox (aceptable: Detox queda como escalada futura si aparece flakiness que Maestro no cubra)

---

## Decisión

**Stack de testing de `apps/mobile`:**

| Capa | Herramienta | Correlato en web (ADR-016 Testing Framework Vitest) |
|---|---|---|
| Unit (dominio/lógica) | **Jest** con preset **`jest-expo`** | Vitest |
| Componentes / UI | **React Native Testing Library** | @testing-library/react |
| E2E | **Maestro** (YAML flows) | Playwright |

- **Unit + componentes:** Jest + `jest-expo` + `@testing-library/react-native` (+ `@testing-library/jest-native` para matchers de RN). Tests como `*.spec.ts`/`*.spec.tsx` junto al código.
- **E2E:** Maestro, flujos `.yaml` en `apps/mobile/.maestro/` cubriendo los caminos críticos (login, ver movimientos del mes, ver resumen 50/30/20 con semáforo).
- **Detox NO** se adopta en el MVP mobile; queda como escalada si Maestro resulta insuficiente para sincronización fina.

### Scripts (`apps/mobile/package.json`)

```jsonc
"test":        "jest",
"test:watch":  "jest --watch",
"test:cov":    "jest --coverage",
"e2e":         "maestro test .maestro/"
```

`jest-expo` se configura vía `"preset": "jest-expo"` en la config de Jest. Maestro se instala aparte (CLI) y corre contra un development build (ADR-010 App Mobile).

### Dependencias objetivo

- `jest`, `jest-expo`, `@types/jest`
- `@testing-library/react-native`, `@testing-library/jest-native`
- `react-test-renderer` (major alineada con la de React Native del SDK Expo elegido)
- Maestro CLI (no es dep npm; se instala en el entorno/CI)

> Las versiones exactas se fijan al hacer scaffolding de `apps/mobile` (post-MVP), tomando lo que fije el Expo SDK elegido — coherente con la política de versiones de ADR-010 App Mobile.

---

## Consecuencias

**Positivas:**

- **Camino soportado y estable:** `jest-expo` lo mantiene Expo y se versiona con el SDK — baja probabilidad de romperse en actualizaciones, a diferencia de forzar Vitest.
- **Transferencia de conocimiento:** RNTL comparte API con la Testing Library del web; el estilo de tests de componentes es prácticamente el mismo.
- **E2E de bajo coste:** Maestro (YAML) permite escribir flujos críticos rápido y con CI ligero, apropiado para un solo desarrollador.
- **Coherencia de seguridad:** todo npm/pnpm → mismo `pnpm audit` y `minimum-release-age` de ADR-006 Package Manager; no se abre un segundo canal de supply-chain.
- **Cierra un pendiente de ADR-010 App Mobile** sin comprometer la estrategia de verificación de ADR-015 Técnicas de Verificación de Requisitos.

**A tener en cuenta:**

- **Dos runners en el repo** (Vitest web / Jest mobile): hay que documentar la diferencia y recordar `vi.*` en web vs `jest.*` en mobile. Mitigado por la casi-equivalencia de API.
- **Maestro requiere entorno nativo** (simulador/emulador o dispositivo) y un development build; su integración en CI (ADR-004 Hosting y Despliegue) se define al montar el pipeline mobile.
- **Post-MVP:** nada de esto se construye hasta arrancar `apps/mobile`; las versiones se fijan entonces para evitar que envejezcan.
- **Detox diferido:** si aparece flakiness por timing que Maestro no resuelva, reconsiderar Detox en un ADR posterior.

---

## Referencias

- [Expo — Unit testing with Jest (jest-expo)](https://docs.expo.dev/develop/unit-testing/)
- [Expo — How to build a solid test harness for Expo apps](https://expo.dev/blog/how-to-build-a-solid-test-harness-for-expo-apps)
- [React Native Testing Library](https://callstack.github.io/react-native-testing-library/)
- [Maestro — documentación](https://maestro.dev/)
- [Detox vs Maestro vs Appium (2026)](https://www.pkgpulse.com/blog/detox-vs-maestro-vs-appium-react-native-e2e-testing-2026)
- ADR-006 Package Manager
- ADR-010 App Mobile
- ADR-015 Técnicas de Verificación de Requisitos
- ADR-016 Testing Framework Vitest

---

*Fecha de decisión: 2026-07-12 · Última actualización: 2026-07-12*
